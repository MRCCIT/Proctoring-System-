import { query } from '../../config/database.js';
import { getRedis, isRedisEnabled } from '../../config/redis.js';
import { violationSqlPredicate } from '../events/violationCatalog.js';
import { computeRiskScore } from '../risk/riskScore.js';
import { livePresenceSql } from '../sessions/livePresence.js';

const refreshInflight = new Map();
const EXAM_AGG_REDIS_TTL_SEC = 60;

export function examAggregateRedisKey(examId) {
  return `exam:agg:${examId}`;
}

async function cacheExamAggregate(examId, row) {
  if (!row || !isRedisEnabled()) return;
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.set(examAggregateRedisKey(examId), JSON.stringify(row), 'EX', EXAM_AGG_REDIS_TTL_SEC);
  } catch {
    /* Redis optional */
  }
}

export async function getExamAggregate(examId) {
  if (isRedisEnabled()) {
    try {
      const redis = await getRedis();
      if (redis) {
        const cached = await redis.get(examAggregateRedisKey(examId));
        if (cached) return JSON.parse(cached);
      }
    } catch {
      /* fall through to Postgres */
    }
  }
  const { rows } = await query(`SELECT * FROM exam_aggregates WHERE exam_id = $1`, [examId]);
  const row = rows[0] || null;
  if (row) void cacheExamAggregate(examId, row);
  return row;
}

export async function refreshExamAggregate(examId, { updateRisk = true } = {}) {
  if (refreshInflight.has(examId)) return refreshInflight.get(examId);
  const p = (async () => {
    const { rows: examRows } = await query(`SELECT id, tenant_id FROM exams WHERE id = $1`, [examId]);
    const exam = examRows[0];
    if (!exam) return null;

    if (updateRisk) {
      const { rows: sessions } = await query(
        `SELECT id FROM exam_sessions WHERE exam_id = $1`,
        [examId]
      );
      for (const s of sessions) {
        const { rows: events } = await query(
          `SELECT event_type, severity, occurred_at, review_status
           FROM session_events WHERE session_id = $1`,
          [s.id]
        );
        const { score, highest_severity } = computeRiskScore(events);
        await query(
          `UPDATE exam_sessions SET risk_score = $2, highest_severity = $3 WHERE id = $1`,
          [s.id, score, highest_severity]
        );
      }
      // Dynamic allocation: fill free capacity for exams with auto_allocate pools
      void import('../tenant/proctorAssignmentEngine.js')
        .then(({ runAllocation }) =>
          runAllocation(exam.tenant_id, examId, { notify: true, dry_run: false }).catch(() => null)
        )
        .catch(() => {});
    }

    const vio = violationSqlPredicate('se');
    const { rows } = await query(
      `SELECT
         count(*)::int AS total_candidates,
         count(*) FILTER (WHERE s.status <> 'scheduled')::int AS appeared,
         count(*) FILTER (WHERE s.status = 'scheduled')::int AS absent,
         count(*) FILTER (WHERE s.status = 'completed')::int AS submitted,
         count(*) FILTER (WHERE s.status IN ('terminated','failed'))::int AS terminated,
         count(*) FILTER (WHERE ${livePresenceSql('s')})::int AS live_count,
         count(*) FILTER (WHERE s.review_decision = 'flagged')::int AS flagged_count,
         count(*) FILTER (WHERE COALESCE(s.review_status,'pending') <> 'reviewed' AND s.status IN ('completed','terminated','failed'))::int AS review_pending,
         count(*) FILTER (WHERE COALESCE(s.review_status,'pending') = 'reviewed')::int AS review_done,
         COALESCE(avg(s.risk_score), 0)::numeric AS avg_risk_score,
         (SELECT count(*)::int FROM session_events se
            JOIN exam_sessions sx ON sx.id = se.session_id
           WHERE sx.exam_id = $1 AND ${vio} AND COALESCE(se.review_status,'open') <> 'dismissed') AS total_violations,
         (SELECT count(*)::int FROM session_events se
            JOIN exam_sessions sx ON sx.id = se.session_id
           WHERE sx.exam_id = $1 AND ${vio} AND se.severity = 'critical' AND COALESCE(se.review_status,'open') <> 'dismissed') AS critical_violation_count
       FROM exam_sessions s
       WHERE s.exam_id = $1`,
      [examId]
    );
    const a = rows[0] || {};
    const { rows: upserted } = await query(
      `INSERT INTO exam_aggregates (
         exam_id, tenant_id, total_candidates, appeared, absent, submitted, terminated,
         live_count, flagged_count, critical_violation_count, total_violations, avg_risk_score,
         review_pending, review_done, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       ON CONFLICT (exam_id) DO UPDATE SET
         total_candidates = EXCLUDED.total_candidates,
         appeared = EXCLUDED.appeared,
         absent = EXCLUDED.absent,
         submitted = EXCLUDED.submitted,
         terminated = EXCLUDED.terminated,
         live_count = EXCLUDED.live_count,
         flagged_count = EXCLUDED.flagged_count,
         critical_violation_count = EXCLUDED.critical_violation_count,
         total_violations = EXCLUDED.total_violations,
         avg_risk_score = EXCLUDED.avg_risk_score,
         review_pending = EXCLUDED.review_pending,
         review_done = EXCLUDED.review_done,
         updated_at = now()
       RETURNING *`,
      [
        examId,
        exam.tenant_id,
        a.total_candidates || 0,
        a.appeared || 0,
        a.absent || 0,
        a.submitted || 0,
        a.terminated || 0,
        a.live_count || 0,
        a.flagged_count || 0,
        a.critical_violation_count || 0,
        a.total_violations || 0,
        a.avg_risk_score || 0,
        a.review_pending || 0,
        a.review_done || 0,
      ]
    );
    const agg = upserted[0];
    await cacheExamAggregate(examId, agg);
    return agg;
  })().finally(() => refreshInflight.delete(examId));
  refreshInflight.set(examId, p);
  return p;
}
