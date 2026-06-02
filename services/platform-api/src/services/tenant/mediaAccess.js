import { verifyResourceToken } from '../../utils/jwt.js';
import { query } from '../../config/database.js';

export async function resolveRecordingRequest(token) {
  let decoded;
  try {
    decoded = verifyResourceToken(token);
  } catch {
    const e = new Error('Invalid or expired token');
    e.status = 401;
    throw e;
  }
  if (decoded.typ !== 'recording' || !decoded.tid || !decoded.sid) {
    const e = new Error('Invalid token');
    e.status = 401;
    throw e;
  }
  const { rows } = await query(
    `SELECT id, tenant_id, recording_object_key, status FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
    [decoded.sid, decoded.tid]
  );
  if (!rows.length) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  return rows[0];
}

export async function resolveSessionReportRequest(token) {
  let decoded;
  try {
    decoded = verifyResourceToken(token);
  } catch {
    const e = new Error('Invalid or expired token');
    e.status = 401;
    throw e;
  }
  if (decoded.typ !== 'session_report' || !decoded.tid || !decoded.sid) {
    const e = new Error('Invalid token');
    e.status = 401;
    throw e;
  }
  const { rows } = await query(
    `SELECT s.id, s.tenant_id, s.status, s.violation_flags, s.external_ref, e.title AS exam_title
     FROM exam_sessions s
     LEFT JOIN exams e ON e.id = s.exam_id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [decoded.sid, decoded.tid]
  );
  if (!rows.length) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  return rows[0];
}
