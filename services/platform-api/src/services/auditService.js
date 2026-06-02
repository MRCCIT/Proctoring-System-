import { query } from '../config/database.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function listAuditLogs({ cursor, limit: rawLimit, tenant_id, action }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [];
  const filters = [];
  if (tenant_id) {
    params.push(tenant_id);
    filters.push(`al.tenant_id = $${params.length}::uuid`);
  }
  if (action) {
    params.push(`%${action}%`);
    filters.push(`al.action ILIKE $${params.length}`);
  }
  let where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  if (c?.created_at && c?.id != null && c?.id !== '') {
    params.push(c.created_at, Number(c.id));
    const tuple = `($${params.length - 1}::timestamptz, $${params.length}::bigint)`;
    where += (where ? ' AND ' : 'WHERE ') + `(al.created_at, al.id) < ${tuple}`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const sql = `
    SELECT al.*, t.slug AS tenant_slug
    FROM audit_logs al
    LEFT JOIN tenants t ON t.id = al.tenant_id
    ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT $${limIdx}
  `;
  const { rows } = await query(sql, params);
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: String(last.id) });
  }
  return { items: slice, next_cursor };
}
