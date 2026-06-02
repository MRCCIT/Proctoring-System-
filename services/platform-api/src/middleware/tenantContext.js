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
    if (decoded.role !== 'tenant_admin' || !decoded.tenant_id) {
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
    req.tenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      authMode: 'jwt',
      userId: decoded.sub,
      email: decoded.email,
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
