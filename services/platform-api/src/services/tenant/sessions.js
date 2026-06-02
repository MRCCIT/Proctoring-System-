import { query } from '../../config/database.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function listSessions(tenantId, { cursor, limit: rawLimit, exam_id }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId];
  let where = 'WHERE s.tenant_id = $1';
  if (exam_id) {
    params.push(exam_id);
    where += ` AND s.exam_id = $${params.length}::uuid`;
  }
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where += ` AND (s.created_at, s.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT s.*, e.title AS exam_title FROM exam_sessions s
     LEFT JOIN exams e ON e.id = s.exam_id
     ${where}
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT $${limIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  return { items: slice, next_cursor };
}

export async function listLiveSessions(tenantId, { cursor, limit: rawLimit }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId];
  let where = `WHERE s.tenant_id = $1 AND s.status = 'active'`;
  if (c?.started_at && c?.id) {
    params.push(c.started_at, c.id);
    where += ` AND (COALESCE(s.started_at, s.created_at), s.id) < ($2::timestamptz, $3::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT s.*,
            COALESCE(NULLIF(trim(e.title), ''), 'SDK / open exam') AS exam_title,
            COALESCE(
              c.email,
              (SELECT email FROM candidates cx
                WHERE cx.tenant_id = s.tenant_id AND lower(trim(cx.external_ref)) = lower(trim(s.external_ref))
                LIMIT 1),
              NULLIF(trim(s.external_ref), ''),
              '—'
            ) AS candidate_email,
            COALESCE(
              c.name,
              (SELECT name FROM candidates cx
                WHERE cx.tenant_id = s.tenant_id AND lower(trim(cx.external_ref)) = lower(trim(s.external_ref))
                LIMIT 1),
              NULLIF(trim(s.external_ref), ''),
              NULL
            ) AS candidate_name
     FROM exam_sessions s
     LEFT JOIN exams e ON e.id = s.exam_id
     LEFT JOIN candidates c ON c.id = s.candidate_id
     ${where}
     ORDER BY COALESCE(s.started_at, s.created_at) DESC NULLS LAST, s.id DESC
     LIMIT $${limIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    const ts = (last.started_at || last.created_at).toISOString();
    next_cursor = encodeCursor({ started_at: ts, id: last.id });
  }
  return { items: slice, next_cursor };
}

export async function getSessionDetail(tenantId, sessionId) {
  const { rows: srows } = await query(
    `SELECT s.*,
            COALESCE(NULLIF(trim(e.title), ''), 'SDK / open exam') AS exam_title,
            COALESCE(
              c.email,
              (SELECT email FROM candidates cx
                WHERE cx.tenant_id = s.tenant_id AND lower(trim(cx.external_ref)) = lower(trim(s.external_ref))
                LIMIT 1),
              NULLIF(trim(s.external_ref), ''),
              NULL
            ) AS candidate_email,
            COALESCE(
              c.name,
              (SELECT name FROM candidates cx
                WHERE cx.tenant_id = s.tenant_id AND lower(trim(cx.external_ref)) = lower(trim(s.external_ref))
                LIMIT 1),
              NULLIF(trim(s.external_ref), ''),
              NULL
            ) AS candidate_name
     FROM exam_sessions s
     LEFT JOIN exams e ON e.id = s.exam_id
     LEFT JOIN candidates c ON c.id = s.candidate_id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, tenantId]
  );
  const session = srows[0];
  if (!session) return null;
  const { rows: events } = await query(
    `SELECT id, event_type, severity, payload, occurred_at
     FROM session_events WHERE session_id = $1 AND tenant_id = $2
     ORDER BY occurred_at ASC, id ASC`,
    [sessionId, tenantId]
  );
  return { session, events };
}

export async function terminateSession(tenantId, sessionId) {
  const { rows } = await query(
    `UPDATE exam_sessions
     SET status = 'terminated', ended_at = COALESCE(ended_at, now()), updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('completed','failed','terminated')
     RETURNING *`,
    [sessionId, tenantId]
  );
  if (!rows.length) {
    const { rows: exists } = await query(`SELECT id, status FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
      sessionId,
      tenantId,
    ]);
    if (!exists.length) return { notFound: true };
    return { alreadyClosed: true, session: exists[0] };
  }
  return { session: rows[0] };
}

export async function listSnapshots(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT id, object_key, caption, violation_context, captured_at, file_path, mime_type, bytes, source
     FROM session_snapshots WHERE session_id = $1 AND tenant_id = $2 ORDER BY captured_at DESC`,
    [sessionId, tenantId]
  );
  return rows;
}

export async function assertSessionBelongs(tenantId, sessionId) {
  const { rows } = await query(`SELECT id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [sessionId, tenantId]);
  return rows.length > 0;
}
