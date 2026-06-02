import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getSdkCredentials, rotateTenantApiKey } from '../../services/tenant/sdk.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';

const router = Router();

router.get(
  '/credentials',
  asyncHandler(async (req, res) => {
    const data = await getSdkCredentials(req.tenantContext.tenantId);
    if (!data) {
      return res.status(404).json({ data: null });
    }
    res.json({ data });
  })
);

router.post(
  '/rotate-key',
  asyncHandler(async (req, res) => {
    if (req.tenantContext.authMode !== 'jwt') {
      return res.status(403).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.forbidden,
          title: 'Forbidden',
          status: 403,
          detail: 'Key rotation requires tenant admin JWT authentication, not API key.',
        })
      );
    }
    const result = await rotateTenantApiKey(req.tenantContext.tenantId);
    if (!result) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Tenant not found' })
      );
    }
    res.json({ data: result });
  })
);

export default router;
