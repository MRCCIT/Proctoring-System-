import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { findTenantByApiKey } from '../services/tenant/tenantLookup.js';
import { verifySdkSessionToken } from '../utils/jwt.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Candidate SDK routes: X-API-Key (integration/dev) or X-Session-Token (browser after launch/link).
 */
export const requireSdkCandidateAuth = asyncHandler(async (req, res, next) => {
  const sessionToken = req.headers['x-session-token'];
  if (sessionToken) {
    let decoded;
    try {
      decoded = verifySdkSessionToken(String(sessionToken));
    } catch {
      return res.status(401).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.unauthorized,
          title: 'Unauthorized',
          status: 401,
          detail: 'Invalid or expired session token.',
        })
      );
    }
    req.sdkTenantId = decoded.tid;
    req.sdkSessionId = decoded.sid;
    req.sdkAuthMode = 'session';
    req.sdkTenant = { id: decoded.tid };
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.unauthorized,
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing X-API-Key or X-Session-Token.',
      })
    );
  }
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
  req.sdkTenant = tenant;
  req.sdkTenantId = tenant.id;
  req.sdkAuthMode = 'api_key';
  next();
});

export const requireSdkApiKeyOnly = requireSdkCandidateAuth;

/** Session tokens may only access their own session id in URL params. */
export function requireSdkSessionScope(req, res, next) {
  if (req.sdkAuthMode !== 'session') return next();
  const paramId = req.params.sessionId || req.params.id;
  if (paramId && paramId !== req.sdkSessionId) {
    return res.status(403).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.forbidden,
        title: 'Forbidden',
        status: 403,
        detail: 'Session token is not valid for this session.',
      })
    );
  }
  return next();
}
