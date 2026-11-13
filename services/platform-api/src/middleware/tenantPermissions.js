import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { defaultPermissions } from '../services/tenant/tenantUsers.js';
import { query } from '../config/database.js';

const ADMIN_ROLES = new Set(['admin', 'sub_admin', 'tenant_admin']);

export function isTenantAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function hasPermission(user, resource, action) {
  if (!user) return false;
  if (isTenantAdminRole(user.role) && user.role !== 'sub_admin') return true;
  const perms = user.permissions && typeof user.permissions === 'object'
    ? user.permissions
    : defaultPermissions(user.role);
  const list = perms?.[resource];
  return Array.isArray(list) && list.includes(action);
}

/** Require JWT user (not API key) with permission. */
export function requirePermission(resource, action) {
  return (req, res, next) => {
    const ctx = req.tenantContext || {};
    if (ctx.authMode === 'api_key') return next();
    const user = req.tenantUser;
    if (!user) {
      return res.status(401).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.unauthorized,
          title: 'Unauthorized',
          status: 401,
          detail: 'Tenant user context required.',
        })
      );
    }
    if (!hasPermission(user, resource, action)) {
      return res.status(403).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.forbidden,
          title: 'Forbidden',
          status: 403,
          detail: `Missing permission ${resource}:${action}`,
        })
      );
    }
    return next();
  };
}

/** Admins only (hide Team/Settings from proctors). */
export function requireAdminRole(req, res, next) {
  const user = req.tenantUser;
  if (req.tenantContext?.authMode === 'api_key') return next();
  if (!user || !isTenantAdminRole(user.role)) {
    return res.status(403).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.forbidden,
        title: 'Forbidden',
        status: 403,
        detail: 'Admin access required.',
      })
    );
  }
  return next();
}

/**
 * Proctors may only access sessions they actively own.
 * Admins bypass. Returns boolean.
 */
export async function proctorOwnsSession(tenantId, userId, role, sessionId) {
  if (isTenantAdminRole(role)) return true;
  if (role !== 'proctor' && role !== 'viewer') return false;
  const { rows } = await query(
    `SELECT 1
       FROM proctor_assignments pa
      WHERE pa.tenant_id = $1
        AND pa.proctor_user_id = $2
        AND pa.status = 'active'
        AND (
          pa.session_id = $3
          OR (
            pa.session_id IS NULL
            AND pa.exam_id IS NOT NULL
            AND pa.exam_id = (SELECT exam_id FROM exam_sessions WHERE id = $3 AND tenant_id = $1)
          )
        )
      LIMIT 1`,
    [tenantId, userId, sessionId]
  );
  return rows.length > 0;
}

export function requireSessionAccess() {
  return async (req, res, next) => {
    try {
      const sessionId = req.params.id || req.params.sessionId || req.body?.session_id;
      if (!sessionId) return next();
      const ctx = req.tenantContext;
      const user = req.tenantUser;
      if (!ctx || ctx.authMode === 'api_key' || !user) return next();
      if (isTenantAdminRole(user.role)) return next();
      const ok = await proctorOwnsSession(ctx.tenantId, user.id, user.role, sessionId);
      if (!ok) {
        return res.status(403).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.forbidden,
            title: 'Forbidden',
            status: 403,
            detail: 'This candidate is not assigned to you.',
          })
        );
      }
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
