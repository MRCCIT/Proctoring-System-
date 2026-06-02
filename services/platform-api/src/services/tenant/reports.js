import { query } from '../../config/database.js';
import { getExam } from './exams.js';

export async function getExamReport(tenantId, examId) {
  const exam = await getExam(tenantId, examId);
  if (!exam) return null;
  const { rows: stats } = await query(
    `SELECT
       COUNT(*)::int AS sessions,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'terminated')::int AS terminated,
       COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE success IS TRUE)::int AS passed,
       COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed_review,
       COALESCE(SUM(violation_flags), 0)::bigint AS violation_flags,
       COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)::float AS avg_duration_seconds
     FROM exam_sessions
     WHERE tenant_id = $1 AND exam_id = $2`,
    [tenantId, examId]
  );
  const s = stats[0];
  const total = s.sessions || 0;
  const passRate = total > 0 ? (s.passed / total) * 100 : 0;
  return {
    exam: { id: exam.id, title: exam.title, scheduling: exam.scheduling },
    statistics: {
      sessions: s.sessions,
      completed: s.completed,
      failed: s.failed,
      terminated: s.terminated,
      paused: s.paused,
      active: s.active,
      passed: s.passed,
      failed_review: s.failed_review,
      pass_rate: Number(passRate.toFixed(2)),
      violation_flags: String(s.violation_flags),
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
  const { rows: sessions } = await query(
    `SELECT s.id, s.status, s.success, s.violation_flags, s.started_at, s.ended_at, s.created_at,
            e.id AS exam_id, e.title AS exam_title
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
  const { rows } = await query(
    `SELECT c.id AS candidate_id, c.email, c.name, c.external_ref,
            s.id AS session_id, s.status, s.success, s.started_at, s.ended_at, s.violation_flags
       FROM candidates c
       LEFT JOIN exam_sessions s ON s.candidate_id = c.id AND s.exam_id = $2
      WHERE c.tenant_id = $1
      ORDER BY c.created_at ASC`,
    [tenantId, examId]
  );
  return {
    exam: { id: exam.id, title: exam.title },
    candidates: rows.map((r) => ({
      candidate_id: r.candidate_id,
      email: r.email,
      name: r.name,
      external_ref: r.external_ref,
      attended: r.session_id != null,
      session_id: r.session_id,
      status: r.status,
      success: r.success,
      started_at: r.started_at,
      ended_at: r.ended_at,
      violation_flags: r.violation_flags,
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
