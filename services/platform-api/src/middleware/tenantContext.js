import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { verifyTenantAdminToken } from '../utils/jwt.js';
import { findTenantByApiKey } from '../services/tenant/tenantLookup.js';
import { query } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const requireTenantContext = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (apiKey) {
    const tenant = await findTenantByApiKey(String(apiKey));
    if (!tenant) {
      return res.status(401).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.unauthorized,
          title: 'Unauthorized',
          status: 401,
          detail: 'Invalid X-API-Key.',
        })
      );
    }
    if (tenant.status === 'suspended') {
      return res.status(403).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.forbidden,
          title: 'Forbidden',
          status: 403,
          detail: 'Tenant is suspended.',
        })
      );
    }
    req.tenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      authMode: 'api_key',
    };
    return next();
  }

  if (scheme === 'Bearer' && token) {
    let decoded;
    try {
      decoded = verifyTenantAdminToken(token);
    } catch {
      return res.status(401).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.unauthorized,
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid Bearer token for tenant admin.',
        })
      );
    }
    const allowedJwtRoles = new Set(['tenant_admin', 'admin', 'sub_admin', 'proctor', 'viewer']);
    if (!allowedJwtRoles.has(decoded.role) || !decoded.tenant_id) {
      return res.status(401).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.unauthorized,
          title: 'Unauthorized',
          status: 401,
          detail: 'Invalid token for tenant API.',
        })
      );
    }
    const { rows } = await query(`SELECT id, slug, status FROM tenants WHERE id = $1`, [
      decoded.tenant_id,
    ]);
    const tenant = rows[0];
    if (!tenant) {
      return res.status(401).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.unauthorized,
          title: 'Unauthorized',
          status: 401,
          detail: 'Tenant no longer exists.',
        })
      );
    }
    if (tenant.status === 'suspended') {
      return res.status(403).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.forbidden,
          title: 'Forbidden',
          status: 403,
          detail: 'Tenant is suspended.',
        })
      );
    }

    let tenantUser = null;
    if (decoded.sub) {
      let users;
      try {
        ({ rows: users } = await query(
          `SELECT id, email, display_name, role, permissions, status,
                  max_candidate_capacity, last_active_at
             FROM tenant_users
            WHERE id = $1 AND tenant_id = $2`,
          [decoded.sub, tenant.id]
        ));
      } catch {
        ({ rows: users } = await query(
          `SELECT id, email, display_name, role, permissions, status
             FROM tenant_users
            WHERE id = $1 AND tenant_id = $2`,
          [decoded.sub, tenant.id]
        ));
      }
      tenantUser = users[0] || null;
      if (tenantUser && tenantUser.status && !['active', 'pending'].includes(tenantUser.status)) {
        return res.status(403).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.forbidden,
            title: 'Forbidden',
            status: 403,
            detail: 'User account is disabled.',
          })
        );
      }
      // Legacy JWT role tenant_admin → treat as admin if DB missing
      if (tenantUser && decoded.role === 'tenant_admin' && !tenantUser.role) {
        tenantUser.role = 'admin';
      }
      if (!tenantUser && decoded.role === 'tenant_admin') {
        tenantUser = {
          id: decoded.sub,
          email: decoded.email,
          role: 'admin',
          permissions: null,
          status: 'active',
        };
      }
      if (!tenantUser && decoded.impersonation) {
        tenantUser = {
          id: decoded.sub,
          email: decoded.email,
          display_name: decoded.display_name || decoded.email || 'Super Admin',
          role: decoded.role === 'sub_admin' ? 'sub_admin' : 'admin',
          permissions: decoded.permissions || null,
          status: 'active',
        };
      }
    }

    req.tenantUser = tenantUser;
    req.tenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      authMode: 'jwt',
      userId: decoded.sub,
      email: decoded.email,
      role: tenantUser?.role || decoded.role,
      impersonation: Boolean(decoded.impersonation),
      impersonatedBy: decoded.impersonated_by || null,
      impersonatorEmail: decoded.impersonator_email || null,
    };
    return next();
  }

  return res.status(401).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.unauthorized,
      title: 'Unauthorized',
      status: 401,
      detail: 'Provide Authorization: Bearer <JWT> (tenant admin) or X-API-Key.',
    })
  );
});
