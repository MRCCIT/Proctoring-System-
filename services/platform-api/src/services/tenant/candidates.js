import { query } from '../../config/database.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function listCandidates(tenantId, { cursor, limit: rawLimit }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId];
  let where = 'WHERE c.tenant_id = $1';
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where += ` AND (c.created_at, c.id) < ($2::timestamptz, $3::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT c.* FROM candidates c ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT $${limIdx}`,
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function bulkImportCandidates(tenantId, rowsInput) {
  const inserted = [];
  const skipped = [];
  for (const r of rowsInput) {
    const email = normalizeEmail(r.email);
    const name = r.name != null ? String(r.name).trim() : null;
    const external_ref = r.external_ref != null ? String(r.external_ref).trim() : null;
    if (!email) {
      skipped.push({ reason: 'missing_email', row: r });
      continue;
    }
    try {
      const { rows } = await query(
        `INSERT INTO candidates (tenant_id, email, name, external_ref, metadata)
         VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '{}'))
         ON CONFLICT (tenant_id, email) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, candidates.name),
           external_ref = COALESCE(EXCLUDED.external_ref, candidates.external_ref),
           updated_at = now()
         RETURNING id, email, name, external_ref`,
        [tenantId, email, name, external_ref, r.metadata ? JSON.stringify(r.metadata) : null]
      );
      inserted.push(rows[0]);
    } catch (err) {
      skipped.push({ reason: err.message, email });
    }
  }
  return { inserted, skipped };
}

export function parseCsvToCandidateRows(csvText) {
  const text = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n').filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iEmail = idx('email');
  if (iEmail < 0) {
    const e = new Error('CSV must include an "email" column header');
    e.status = 422;
    throw e;
  }
  const iName = idx('name');
  const iRef = idx('external_ref');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const email = cols[iEmail];
    const name = iName >= 0 ? cols[iName] : null;
    const external_ref = iRef >= 0 ? cols[iRef] : null;
    out.push({ email, name, external_ref });
  }
  return out;
}
