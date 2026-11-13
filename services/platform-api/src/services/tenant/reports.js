import { query } from '../../config/database.js';
import { getExam } from './exams.js';
import { violationSqlPredicate } from '../events/violationCatalog.js';

export async function getExamReport(tenantId, examId) {
  const exam = await getExam(tenantId, examId);
  if (!exam) return null;
  const vio = violationSqlPredicate('se');
  const { rows: stats } = await query(
    `SELECT
       COUNT(*)::int AS attempts,
       COUNT(DISTINCT COALESCE(s.candidate_id::text, lower(trim(COALESCE(s.external_ref, s.candidate_name, s.id::text)))))::int AS candidates,
       COUNT(*) FILTER (WHERE s.status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE s.status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE s.status = 'terminated')::int AS terminated,
       COUNT(*) FILTER (WHERE s.status = 'paused')::int AS paused,
       COUNT(*) FILTER (WHERE s.status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE s.success IS TRUE)::int AS passed,
       COUNT(*) FILTER (WHERE s.success IS FALSE)::int AS failed_review,
       COUNT(*) FILTER (WHERE COALESCE(s.review_status, 'pending') = 'pending'
         AND s.status IN ('completed','terminated','failed'))::int AS needs_review,
       COALESCE(AVG(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) FILTER (WHERE s.started_at IS NOT NULL), 0)::float AS avg_duration_seconds,
       (
         SELECT count(*)::int
           FROM session_events se
           JOIN exam_sessions sx ON sx.id = se.session_id AND sx.tenant_id = se.tenant_id
          WHERE sx.tenant_id = $1 AND sx.exam_id = $2 AND ${vio}
            AND COALESCE(se.review_status, 'open') <> 'dismissed'
       ) AS total_violations,
       (
         SELECT count(*)::int
           FROM session_events se
           JOIN exam_sessions sx ON sx.id = se.session_id AND sx.tenant_id = se.tenant_id
          WHERE sx.tenant_id = $1 AND sx.exam_id = $2 AND ${vio}
            AND se.severity IN ('flag','critical')
            AND COALESCE(se.review_status, 'open') <> 'dismissed'
       ) AS high_severity_violations
     FROM exam_sessions s
     WHERE s.tenant_id = $1 AND s.exam_id = $2`,
    [tenantId, examId]
  );
  const s = stats[0];
  const attempts = s.attempts || 0;
  const passRate = attempts > 0 ? (s.passed / attempts) * 100 : 0;
  return {
    exam: { id: exam.id, title: exam.title, scheduling: exam.scheduling },
    statistics: {
      candidates: s.candidates,
      attempts,
      sessions: attempts, // backward compatible alias
      active: s.active,
      completed: s.completed,
      terminated: s.terminated,
      failed: s.failed,
      paused: s.paused,
      passed: s.passed,
      failed_review: s.failed_review,
      needs_review: s.needs_review,
      pass_rate: Number(passRate.toFixed(2)),
      total_violations: s.total_violations,
      high_severity_violations: s.high_severity_violations,
      avg_duration_seconds: Number((s.avg_duration_seconds || 0).toFixed(1)),
    },
    generated_at: new Date().toISOString(),
  };
}

export async function getCandidateReport(tenantId, candidateId) {
  const { rows: cand } = await query(
    `SELECT id, email, name, external_ref, metadata, created_at FROM candidates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, candidateId]
  );
  if (!cand[0]) return null;
  const vio = violationSqlPredicate('se');
  const { rows: sessions } = await query(
    `SELECT s.id, s.status, s.success, s.started_at, s.ended_at, s.created_at, s.review_status, s.review_decision,
            e.id AS exam_id, e.title AS exam_title,
            (SELECT count(*)::int FROM session_events se
              WHERE se.session_id = s.id AND ${vio} AND COALESCE(se.review_status,'open') <> 'dismissed') AS violation_count
       FROM exam_sessions s
       LEFT JOIN exams e ON e.id = s.exam_id
      WHERE s.tenant_id = $1 AND s.candidate_id = $2
      ORDER BY s.created_at DESC`,
    [tenantId, candidateId]
  );
  return {
    candidate: cand[0],
    sessions,
    generated_at: new Date().toISOString(),
  };
}

export async function getAttendanceReport(tenantId, examId) {
  const exam = await getExam(tenantId, examId);
  if (!exam) return null;
  const vio = violationSqlPredicate('se');
  // One row per proctoring attempt on this exam, with real detection counts (same as session review).
  const { rows } = await query(
    `SELECT c.id AS candidate_id, c.email, c.name, c.external_ref,
            s.id AS session_id, s.status, s.success, s.started_at, s.ended_at,
            s.review_status, s.review_decision, s.risk_score, s.highest_severity,
            s.candidate_name AS session_candidate_name, s.external_ref AS session_external_ref,
            (SELECT count(*)::int FROM session_events se
              WHERE se.session_id = s.id AND ${vio}
                AND COALESCE(se.review_status,'open') <> 'dismissed') AS violation_count,
            (SELECT count(*)::int FROM session_events se
              WHERE se.session_id = s.id AND ${vio}
                AND se.severity IN ('flag','critical')
                AND COALESCE(se.review_status,'open') <> 'dismissed') AS high_severity_count
       FROM exam_sessions s
       LEFT JOIN candidates c ON c.id = s.candidate_id AND c.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1 AND s.exam_id = $2
      ORDER BY COALESCE(s.started_at, s.created_at) DESC NULLS LAST, s.id DESC`,
    [tenantId, examId]
  );
  return {
    exam: { id: exam.id, title: exam.title },
    candidates: rows.map((r) => ({
      candidate_id: r.candidate_id || r.session_id,
      email: r.email,
      name: r.name || r.session_candidate_name || r.session_external_ref || r.external_ref,
      external_ref: r.external_ref || r.session_external_ref,
      attended: true,
      session_id: r.session_id,
      status: r.status,
      success: r.success,
      started_at: r.started_at,
      ended_at: r.ended_at,
      review_status: r.review_status,
      review_decision: r.review_decision,
      risk_score: r.risk_score != null ? Number(r.risk_score) : null,
      highest_severity: r.highest_severity,
      violation_count: r.violation_count || 0,
      high_severity_count: r.high_severity_count || 0,
      // Keep legacy key for old CSV consumers, but use real detections.
      violation_flags: r.violation_count || 0,
    })),
    generated_at: new Date().toISOString(),
  };
}

export function rowsToCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map((c) => esc(c.label || c.key)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return header + '\n' + body;
}
