import { query } from '../config/database.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';
import { hashApiKey, generateApiKey } from '../utils/apiKey.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

const tenantSelectStats = `
  t.id,
  t.name,
  t.slug,
  t.status,
  t.api_key_prefix,
  t.contact_email,
  t.contact_name,
  t.integration_status,
  t.sdk_version,
  t.feature_flags,
  t.quotas,
  t.metadata,
  t.created_at,
  t.updated_at,
  (SELECT COUNT(*)::int FROM exam_sessions s WHERE s.tenant_id = t.id) AS total_sessions,
  (SELECT COUNT(*)::int FROM exam_sessions s WHERE s.tenant_id = t.id AND s.status = 'active') AS active_sessions,
  (SELECT COALESCE(SUM(s.storage_bytes), 0)::bigint FROM exam_sessions s WHERE s.tenant_id = t.id) AS storage_bytes_used,
  (SELECT COALESCE(SUM(s.bytes_egress), 0)::bigint FROM exam_sessions s WHERE s.tenant_id = t.id) AS bytes_egress_total,
  (SELECT COALESCE(AVG(CASE WHEN s.success IS TRUE THEN 1.0 WHEN s.success IS FALSE THEN 0.0 END), NULL)::float
     FROM exam_sessions s WHERE s.tenant_id = t.id AND s.status IN ('completed','failed','terminated')) AS session_success_rate
`;

export async function listTenants({ cursor, limit: rawLimit }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [];
  let where = '';
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where = `WHERE (t.created_at, t.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const sql = `
    SELECT ${tenantSelectStats}
    FROM tenants t
    ${where}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT $${limIdx}
  `;
  const { rows } = await query(sql, params);
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  return { items: slice.map(mapTenantListRow), next_cursor };
}

export async function getTenantById(id) {
  const { rows } = await query(
    `SELECT ${tenantSelectStats} FROM tenants t WHERE t.id = $1`,
    [id]
  );
  if (!rows.length) return null;
  return mapTenantDetailRow(rows[0]);
}

export async function createTenant(body) {
  const name = String(body.name || '').trim();
  const slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!name || !slug) {
    const e = new Error('name and slug are required');
    e.status = 422;
    throw e;
  }
  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);
  const prefix = plainKey.slice(0, 12);
  const feature_flags = body.feature_flags || {};
  const quotas = body.quotas || { max_concurrent_sessions: 100, storage_mb: 10240 };
  const contact_email = body.contact_email || null;
  const contact_name = body.contact_name || null;

  try {
    const { rows } = await query(
      `INSERT INTO tenants (name, slug, api_key_hash, api_key_prefix, contact_email, contact_name, feature_flags, quotas, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, COALESCE($9::jsonb, '{}'))
       RETURNING id`,
      [name, slug, keyHash, prefix, contact_email, contact_name, JSON.stringify(feature_flags), JSON.stringify(quotas), body.metadata ? JSON.stringify(body.metadata) : null]
    );
    const tenant = await getTenantById(rows[0].id);
    return { tenant, api_key: plainKey };
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('slug must be unique');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

export async function updateTenant(id, body) {
  const allowed = ['name', 'contact_email', 'contact_name', 'integration_status', 'sdk_version', 'feature_flags', 'quotas', 'metadata'];
  const sets = [];
  const params = [];
  let i = 1;
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (['feature_flags', 'quotas', 'metadata'].includes(key)) {
      sets.push(`${key} = $${i}::jsonb`);
      params.push(JSON.stringify(body[key]));
    } else {
      sets.push(`${key} = $${i}`);
      params.push(body[key]);
    }
    i++;
  }
  if (!sets.length) {
    const e = new Error('No valid fields to update');
    e.status = 422;
    throw e;
  }
  sets.push(`updated_at = now()`);
  params.push(id);
  const { rowCount } = await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i}`, params);
  if (!rowCount) {
    const e = new Error('Tenant not found');
    e.status = 404;
    throw e;
  }
  return getTenantById(id);
}

export async function suspendTenant(id) {
  const { rows } = await query(
    `UPDATE tenants SET status = 'suspended', updated_at = now() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!rows.length) {
    const e = new Error('Tenant not found');
    e.status = 404;
    throw e;
  }
  return getTenantById(id);
}

export async function rotateTenantApiKey(id) {
  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);
  const prefix = plainKey.slice(0, 12);
  const { rows } = await query(
    `UPDATE tenants SET api_key_hash = $1, api_key_prefix = $2, updated_at = now() WHERE id = $3 RETURNING id`,
    [keyHash, prefix, id]
  );
  if (!rows.length) {
    const e = new Error('Tenant not found');
    e.status = 404;
    throw e;
  }
  const tenant = await getTenantById(id);
  return { tenant, api_key: plainKey };
}

function mapTenantListRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    api_key_prefix: row.api_key_prefix,
    contact_email: row.contact_email,
    usage: {
      total_sessions: row.total_sessions,
      active_sessions: row.active_sessions,
      storage_bytes_used: String(row.storage_bytes_used),
      bytes_egress_total: String(row.bytes_egress_total),
      session_success_rate: row.session_success_rate,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTenantDetailRow(row) {
  return {
    ...mapTenantListRow(row),
    contact_name: row.contact_name,
    integration_status: row.integration_status,
    sdk_version: row.sdk_version,
    feature_flags: row.feature_flags,
    quotas: row.quotas,
    metadata: row.metadata,
  };
}
