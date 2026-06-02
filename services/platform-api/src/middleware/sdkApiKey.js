import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { findTenantByApiKey } from '../services/tenant/tenantLookup.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * SDK-facing routes: requires X-API-Key (tenant-scoped). Bearer JWT is not accepted here.
 */
export const requireSdkApiKey = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.unauthorized,
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing X-API-Key header.',
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
  next();
});
