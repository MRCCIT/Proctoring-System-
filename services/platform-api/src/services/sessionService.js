import { query } from '../config/database.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function listActiveSessions({ cursor, limit: rawLimit }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [];
  let where = `WHERE s.status = 'active'`;
  if (c?.started_at && c?.id) {
    params.push(c.started_at, c.id);
    const a = params.length - 1;
    const b = params.length;
    where += ` AND (COALESCE(s.started_at, s.created_at), s.id) < ($${a}::timestamptz, $${b}::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const sql = `
    SELECT
      s.id,
      s.tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      s.external_ref,
      s.status,
      s.started_at,
      s.bytes_egress,
      s.storage_bytes,
      s.violation_flags,
      s.country_code,
      s.created_at
    FROM exam_sessions s
    JOIN tenants t ON t.id = s.tenant_id
    ${where}
    ORDER BY COALESCE(s.started_at, s.created_at) DESC NULLS LAST, s.id DESC
    LIMIT $${limIdx}
  `;
  const { rows } = await query(sql, params);
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

export async function getSessionById(sessionId) {
  const { rows } = await query(
    `SELECT s.*, t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
     FROM exam_sessions s
     JOIN tenants t ON t.id = s.tenant_id
     WHERE s.id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}
