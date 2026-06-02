import bcrypt from 'bcryptjs';
import { query } from '../../config/database.js';
import { signTenantAdminToken } from '../../utils/jwt.js';

export async function loginTenantAdmin({ tenant_slug, email, password }) {
  const slug = String(tenant_slug || '').trim().toLowerCase();
  const em = String(email || '').trim().toLowerCase();
  if (!slug || !em || !password) {
    const e = new Error('tenant_slug, email, and password are required');
    e.status = 422;
    throw e;
  }
  const { rows } = await query(
    `SELECT tu.id, tu.tenant_id, tu.email, tu.password_hash, tu.display_name, tu.role, t.slug, t.status
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE t.slug = $1 AND lower(tu.email) = $2`,
    [slug, em]
  );
  const user = rows[0];
  if (!user || user.status !== 'active') {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }
  const access_token = signTenantAdminToken({
    sub: user.id,
    email: user.email,
    tenant_id: user.tenant_id,
  });
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: process.env.JWT_EXPIRES_IN || '8h',
    tenant: { id: user.tenant_id, slug: user.slug },
    user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role },
  };
}
