import { query } from '../../config/database.js';

const DEFAULTS = {
  primary_color: '#0f172a',
  secondary_color: '#3b82f6',
  accent_color: '#22c55e',
};

export async function getBranding(tenantId) {
  const { rows } = await query(
    `SELECT b.tenant_id, b.logo_url, b.primary_color, b.secondary_color, b.accent_color,
            b.organization_name, b.support_email, b.support_phone, b.candidate_welcome_message,
            b.metadata, b.updated_at, t.name AS tenant_name, t.slug
       FROM tenants t
       LEFT JOIN tenant_branding b ON b.tenant_id = t.id
      WHERE t.id = $1`,
    [tenantId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    tenant_id: tenantId,
    tenant_name: row.tenant_name,
    tenant_slug: row.slug,
    logo_url: row.logo_url || null,
    primary_color: row.primary_color || DEFAULTS.primary_color,
    secondary_color: row.secondary_color || DEFAULTS.secondary_color,
    accent_color: row.accent_color || DEFAULTS.accent_color,
    organization_name: row.organization_name || row.tenant_name || null,
    support_email: row.support_email || null,
    support_phone: row.support_phone || null,
    candidate_welcome_message: row.candidate_welcome_message || null,
    metadata: row.metadata || {},
    updated_at: row.updated_at || null,
  };
}

export async function upsertBranding(tenantId, body) {
  const payload = {
    logo_url: body.logo_url ?? null,
    primary_color: body.primary_color || DEFAULTS.primary_color,
    secondary_color: body.secondary_color || DEFAULTS.secondary_color,
    accent_color: body.accent_color || DEFAULTS.accent_color,
    organization_name: body.organization_name ?? null,
    support_email: body.support_email ?? null,
    support_phone: body.support_phone ?? null,
    candidate_welcome_message: body.candidate_welcome_message ?? null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };
  await query(
    `INSERT INTO tenant_branding
       (tenant_id, logo_url, primary_color, secondary_color, accent_color,
        organization_name, support_email, support_phone, candidate_welcome_message, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       logo_url = EXCLUDED.logo_url,
       primary_color = EXCLUDED.primary_color,
       secondary_color = EXCLUDED.secondary_color,
       accent_color = EXCLUDED.accent_color,
       organization_name = EXCLUDED.organization_name,
       support_email = EXCLUDED.support_email,
       support_phone = EXCLUDED.support_phone,
       candidate_welcome_message = EXCLUDED.candidate_welcome_message,
       metadata = EXCLUDED.metadata,
       updated_at = now()`,
    [
      tenantId,
      payload.logo_url,
      payload.primary_color,
      payload.secondary_color,
      payload.accent_color,
      payload.organization_name,
      payload.support_email,
      payload.support_phone,
      payload.candidate_welcome_message,
      JSON.stringify(payload.metadata),
    ]
  );
  return getBranding(tenantId);
}
