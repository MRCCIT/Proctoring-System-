import { query } from '../../config/database.js';
import { signTenantAdminToken } from '../../utils/jwt.js';
import { config } from '../../config/index.js';
import { getTenantById } from '../tenantService.js';

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Mint a short-lived tenant-admin JWT so a super admin can open the tenant portal.
 * Prefers an active org admin; otherwise issues a synthetic admin impersonation token.
 */
export async function impersonateTenant(tenantId, superadmin) {
  if (!superadmin?.sub) throw fail(401, 'Super admin required');

  const tenant = await getTenantById(tenantId);
  if (!tenant) throw fail(404, 'Tenant not found');
  if (tenant.status === 'suspended') throw fail(403, 'Tenant is suspended');

  const { rows: admins } = await query(
    `SELECT id, email, display_name, role, permissions, status
       FROM tenant_users
      WHERE tenant_id = $1
        AND role IN ('admin', 'sub_admin', 'tenant_admin')
        AND COALESCE(status, 'active') IN ('active', 'pending')
      ORDER BY
        CASE WHEN role IN ('admin', 'tenant_admin') THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(status, 'active') = 'active' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1`,
    [tenantId]
  );
  const admin = admins[0] || null;

  const subject = admin?.id || superadmin.sub;
  const email = admin?.email || superadmin.email || 'superadmin@proctorshield.local';
  const displayName = admin?.display_name || superadmin.email || 'Super Admin';
  const role = admin?.role === 'sub_admin' ? 'sub_admin' : 'admin';

  const access_token = signTenantAdminToken(
    {
      sub: subject,
      email,
      tenant_id: tenantId,
      role,
      permissions: admin?.permissions || undefined,
      display_name: displayName,
      impersonation: true,
      impersonated_by: superadmin.sub,
      impersonator_email: superadmin.email || null,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
    },
    { expiresIn: process.env.IMPERSONATION_JWT_EXPIRES_IN || '2h' }
  );

  const portal = config.tenantAdminPortalUrl;
  const handoff_url = `${portal}/auth/handoff?token=${encodeURIComponent(access_token)}`;

  return {
    access_token,
    token_type: 'Bearer',
    expires_in: process.env.IMPERSONATION_JWT_EXPIRES_IN || '2h',
    handoff_url,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
    user: {
      id: subject,
      email,
      display_name: displayName,
      role,
      via: admin ? 'tenant_admin' : 'synthetic',
    },
    impersonation: {
      by: superadmin.sub,
      email: superadmin.email || null,
    },
  };
}
