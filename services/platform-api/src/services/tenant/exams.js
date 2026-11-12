import { query } from '../../config/database.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';
import { listSessionsEnriched } from './sessionQueries.js';
import { refreshExamAggregate } from '../aggregates/examAggregates.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Prefer pre-aggregated counters (exam_aggregates) so exam list/detail never
 * run COUNT(*) / GROUP BY over sessions+events on the hot read path.
 * Falls back to zeros when the rollup row is missing (refresh kicks in async).
 */
function examStatsSelect() {
  return `
    COALESCE(a.total_candidates, 0)::int AS session_count,
    COALESCE(a.total_candidates, 0)::int AS candidate_count,
    COALESCE(a.live_count, 0)::int AS live_count,
    COALESCE(a.submitted, 0)::int AS completed_count,
    COALESCE(a.review_pending, 0)::int AS awaiting_review_count,
    COALESCE(a.flagged_count, 0)::int AS flagged_count,
    COALESCE(a.critical_violation_count, 0)::int AS critical_violation_count,
    COALESCE(a.total_violations, 0)::int AS violation_count,
    COALESCE(a.review_pending, 0)::int AS review_pending,
    COALESCE(a.review_done, 0)::int AS review_done,
    CASE
      WHEN COALESCE(a.review_pending, 0) + COALESCE(a.review_done, 0) = 0 THEN 100
      ELSE round(100.0 * COALESCE(a.review_done, 0) / (COALESCE(a.review_pending, 0) + COALESCE(a.review_done, 0)))::int
    END AS review_progress_pct,
    a.avg_risk_score,
    a.updated_at AS aggregates_updated_at,
    e.scheduling->>'starts_at' AS starts_at,
    e.scheduling->>'ends_at' AS ends_at,
    (SELECT max(s.created_at) FROM exam_sessions s WHERE s.exam_id = e.id) AS last_session_at,
    NULL::int AS avg_duration_seconds
  `;
}

const EXAM_FROM_SQL = `FROM exams e
  LEFT JOIN exam_aggregates a ON a.exam_id = e.id`;

function mapExamRow(row) {
  if (!row) return null;
  const review_pending = Number(row.review_pending ?? row.awaiting_review_count ?? 0);
  const review_done = Number(row.review_done || 0);
  const review_progress_pct =
    row.review_progress_pct != null
      ? Number(row.review_progress_pct)
      : review_pending + review_done === 0
        ? 100
        : Math.round((100 * review_done) / (review_pending + review_done));
  return {
    ...row,
    session_count: Number(row.session_count || 0),
    candidate_count: Number(row.candidate_count || 0),
    live_count: Number(row.live_count || 0),
    completed_count: Number(row.completed_count || 0),
    awaiting_review_count: Number(row.awaiting_review_count ?? review_pending),
    flagged_count: Number(row.flagged_count || 0),
    critical_violation_count: Number(row.critical_violation_count || 0),
    violation_count: Number(row.violation_count || 0),
    review_pending,
    review_done,
    review_progress_pct,
    avg_risk_score: row.avg_risk_score != null ? Number(row.avg_risk_score) : null,
    avg_duration_seconds: row.avg_duration_seconds != null ? Number(row.avg_duration_seconds) : null,
  };
}

export async function listExams(tenantId, { cursor, limit: rawLimit, q } = {}) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId];
  let where = 'WHERE e.tenant_id = $1';
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where += ` AND (lower(e.title) LIKE $${params.length} OR lower(COALESCE(e.external_exam_id,'')) LIKE $${params.length})`;
  }
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where += ` AND (e.created_at, e.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT e.*, ${examStatsSelect()}
     ${EXAM_FROM_SQL}
     ${where}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $${limIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  for (const r of slice) {
    setImmediate(() => void refreshExamAggregate(r.id, { updateRisk: false }).catch(() => {}));
  }
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  const countParams = [tenantId];
  let countWhere = 'WHERE tenant_id = $1';
  if (q && String(q).trim()) {
    countParams.push(`%${String(q).trim().toLowerCase()}%`);
    countWhere += ` AND (lower(title) LIKE $2 OR lower(COALESCE(external_exam_id,'')) LIKE $2)`;
  }
  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM exams ${countWhere}`, countParams);
  return { items: slice.map(mapExamRow), next_cursor, total: countRows[0]?.total ?? slice.length };
}

export async function createExam(tenantId, body) {
  const title = String(body.title || '').trim();
  if (!title) {
    const e = new Error('title is required');
    e.status = 422;
    throw e;
  }
  const { rows } = await query(
    `INSERT INTO exams (tenant_id, title, description, scheduling, ai_sensitivity, ai_modules, policy_template, branding, external_exam_id, source)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
     RETURNING *`,
    [
      tenantId,
      title,
      body.description || null,
      JSON.stringify(body.scheduling || {}),
      String(body.ai_sensitivity || 'normal'),
      JSON.stringify(body.ai_modules || {}),
      JSON.stringify(body.policy_template || {}),
      JSON.stringify(body.branding || {}),
      body.external_exam_id || null,
      body.source || 'manual',
    ]
  );
  return mapExamRow({
    ...rows[0],
    session_count: 0,
    candidate_count: 0,
    live_count: 0,
    completed_count: 0,
    awaiting_review_count: 0,
    flagged_count: 0,
    critical_violation_count: 0,
    violation_count: 0,
    review_pending: 0,
    review_done: 0,
    review_progress_pct: 100,
  });
}

export async function updateExam(tenantId, examId, body) {
  const { rows } = await query(
    `UPDATE exams SET
       title = COALESCE($3, title),
       description = COALESCE($4, description),
       external_exam_id = COALESCE($5, external_exam_id),
       ai_sensitivity = COALESCE($6, ai_sensitivity),
       updated_at = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [
      examId,
      tenantId,
      body.title != null ? String(body.title).trim() : null,
      body.description !== undefined ? body.description : null,
      body.external_exam_id !== undefined ? body.external_exam_id : null,
      body.ai_sensitivity != null ? String(body.ai_sensitivity) : null,
    ]
  );
  if (!rows[0]) return null;
  return getExamWithStats(tenantId, examId);
}

export async function getExam(tenantId, examId) {
  const { rows } = await query(`SELECT * FROM exams WHERE id = $1 AND tenant_id = $2`, [examId, tenantId]);
  return rows[0] || null;
}

export async function getExamWithStats(tenantId, examId) {
  const { rows } = await query(
    `SELECT e.*, ${examStatsSelect()}
     ${EXAM_FROM_SQL}
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [examId, tenantId]
  );
  const mapped = mapExamRow(rows[0] || null);
  if (mapped) setImmediate(() => void refreshExamAggregate(mapped.id, { updateRisk: false }).catch(() => {}));
  return mapped;
}

export async function listSessionsForExam(tenantId, examId, filters = {}) {
  const exam = await getExam(tenantId, examId);
  if (!exam) return null;
  return listSessionsEnriched(tenantId, { ...filters, exam_id: examId });
}
