import { query } from '../../config/database.js';
import { getExam } from './exams.js';
import { getExamAggregate, refreshExamAggregate } from '../aggregates/examAggregates.js';
import { listSessionsEnriched } from './sessionQueries.js';
import { violationSqlPredicate } from '../events/violationCatalog.js';
const DEFAULT_CANDIDATE_LIMIT = 25;
const MAX_CANDIDATE_LIMIT = 100;

function clampCandidateLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_CANDIDATE_LIMIT;
  return Math.min(n, MAX_CANDIDATE_LIMIT);
}

export function reportFiltersFromQuery(q = {}) {
  return {
    severity: q.severity || q.highest_severity || undefined,
    violation_type: q.violation_type || undefined,
    review_status: q.review_status || undefined,
    q: q.q || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
  };
}

function appendEventScope(where, params, f, alias = 'se') {
  const vio = violationSqlPredicate(alias);
  where.push(`${vio}`);
  where.push(`COALESCE(${alias}.review_status,'open') <> 'dismissed'`);
  if (f.severity) {
    params.push(String(f.severity).toLowerCase());
    where.push(`lower(${alias}.severity) = $${params.length}`);
  }
  if (f.violation_type) {
    params.push(`%${String(f.violation_type).trim().toLowerCase()}%`);
    where.push(`lower(${alias}.event_type) LIKE $${params.length}`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`${alias}.occurred_at >= $${params.length}::timestamptz`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`${alias}.occurred_at <= $${params.length}::timestamptz`);
  }
}

function appendSevereSessionFilters(where, params, f) {
  if (f.review_status) {
    params.push(String(f.review_status));
    where.push(`s.review_status = $${params.length}`);
  }
  if (f.severity) {
    params.push(String(f.severity).toUpperCase());
    where.push(`upper(COALESCE(s.highest_severity,'')) = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${String(f.q).trim().toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(COALESCE(s.candidate_name, c.name, '')) LIKE $${i} OR lower(COALESCE(c.email, '')) LIKE $${i}
        OR lower(COALESCE(s.external_ref, '')) LIKE $${i} OR s.id::text LIKE $${i})`
    );
  }
  if (f.from) {
    params.push(f.from);
    where.push(`s.created_at >= $${params.length}::timestamptz`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`s.created_at <= $${params.length}::timestamptz`);
  }
  if (f.violation_type) {
    const vio = violationSqlPredicate('se2');
    params.push(`%${String(f.violation_type).trim().toLowerCase()}%`);
    const i = params.length;
    where.push(
      `EXISTS (SELECT 1 FROM session_events se2 WHERE se2.session_id = s.id AND ${vio}
        AND lower(se2.event_type) LIKE $${i} AND COALESCE(se2.review_status,'open') <> 'dismissed')`
    );
  }
}

export async function buildExamReport(tenantId, examId, queryOpts = {}) {
  const exam = await getExam(tenantId, examId);
  if (!exam) return null;

  const f = reportFiltersFromQuery(queryOpts);

  let agg = await getExamAggregate(examId);
  const stale = !agg || Date.now() - new Date(agg.updated_at).getTime() > 60_000;
  if (stale) {
    try {
      agg = await refreshExamAggregate(examId, { updateRisk: true });
    } catch {
      /* aggregates table may not exist yet */
    }
  }

  const eventWhere = ['s.exam_id = $1', 's.tenant_id = $2'];
  const eventParams = [examId, tenantId];
  appendEventScope(eventWhere, eventParams, f, 'se');

  const severeWhere = [
    's.exam_id = $1',
    's.tenant_id = $2',
    `(
       upper(COALESCE(s.highest_severity,'')) IN ('CRITICAL','HIGH','FLAG')
       OR COALESCE(s.risk_score,0) >= 20
     )`,
  ];
  const severeParams = [examId, tenantId];
  appendSevereSessionFilters(severeWhere, severeParams, f);
  const vio = violationSqlPredicate('se');

  const candidateLimit = clampCandidateLimit(queryOpts.candidate_limit);
  const sessionFilters = {
    exam_id: examId,
    limit: candidateLimit,
    cursor: queryOpts.candidate_cursor,
    review_status: f.review_status,
    highest_severity: f.severity,
    violation_type: f.violation_type,
    q: f.q,
    from: f.from,
    to: f.to,
    sort: queryOpts.sort || 'risk',
  };

  const [{ rows: byType }, { rows: bySeverity }, { rows: severe }, candidatesPage] = await Promise.all([
    query(
      `SELECT regexp_replace(regexp_replace(se.event_type, '^(violation\\.|ai\\.)', ''), '^ai_', '') AS code,
              count(*)::int AS count
       FROM session_events se
       JOIN exam_sessions s ON s.id = se.session_id
       WHERE ${eventWhere.join(' AND ')}
       GROUP BY 1 ORDER BY count DESC LIMIT 25`,
      eventParams
    ),
    query(
      `SELECT se.severity, count(*)::int AS count
       FROM session_events se
       JOIN exam_sessions s ON s.id = se.session_id
       WHERE ${eventWhere.join(' AND ')}
       GROUP BY 1 ORDER BY count DESC`,
      eventParams
    ),
    query(
      `SELECT s.id, COALESCE(NULLIF(trim(s.candidate_name), ''), c.name, s.external_ref, s.id::text) AS candidate_name,
              s.risk_score, s.highest_severity, s.review_decision, s.review_status,
              (SELECT count(*)::int FROM session_events se WHERE se.session_id = s.id AND ${vio}
                 AND COALESCE(se.review_status,'open') <> 'dismissed') AS violation_count
       FROM exam_sessions s
       LEFT JOIN candidates c ON c.id = s.candidate_id
       WHERE ${severeWhere.join(' AND ')}
       ORDER BY COALESCE(s.risk_score,0) DESC, s.id
       LIMIT 100`,
      severeParams
    ),
    listSessionsEnriched(tenantId, sessionFilters),
  ]);

  const summary = agg
    ? {
        total_candidates: agg.total_candidates,
        appeared: agg.appeared,
        absent: agg.absent,
        submitted: agg.submitted,
        terminated: agg.terminated,
        live_count: agg.live_count,
        flagged_count: agg.flagged_count,
        critical_violation_count: agg.critical_violation_count,
        total_violations: agg.total_violations,
        avg_risk_score: agg.avg_risk_score != null ? Number(agg.avg_risk_score) : null,
        review_pending: agg.review_pending,
        review_done: agg.review_done,
      }
    : {
        total_candidates: 0,
        appeared: 0,
        absent: 0,
        submitted: 0,
        terminated: 0,
        total_violations: 0,
        avg_risk_score: null,
        review_pending: 0,
        review_done: 0,
      };

  const candidateItems = candidatesPage.items.map((s) => ({
    id: s.id,
    candidate_name: s.candidate_name,
    candidate_email: s.candidate_email,
    status: s.status,
    review_status: s.review_status,
    review_decision: s.review_decision,
    risk_score: s.risk_score != null ? Number(s.risk_score) : 0,
    highest_severity: s.highest_severity,
    violation_count: s.violation_count,
    created_at: s.created_at,
  }));

  return {
    exam: { id: exam.id, title: exam.title, external_exam_id: exam.external_exam_id || null },
    summary,
    filters: f,
    violations_by_type: byType,
    violations_by_severity: bySeverity,
    severe_offenders: severe,
    candidates: {
      items: candidateItems,
      next_cursor: candidatesPage.next_cursor,
      total: candidatesPage.total,
    },
    generated_at: new Date().toISOString(),
  };
}
