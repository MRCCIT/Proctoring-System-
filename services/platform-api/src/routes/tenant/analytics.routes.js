import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getTenantUsageAnalytics, getTenantViolationsAnalytics } from '../../services/tenant/analytics.js';

const router = Router();

router.get(
  '/usage',
  asyncHandler(async (req, res) => {
    const data = await getTenantUsageAnalytics(req.tenantContext.tenantId);
    res.json({ data });
  })
);

router.get(
  '/violations',
  asyncHandler(async (req, res) => {
    const data = await getTenantViolationsAnalytics(req.tenantContext.tenantId);
    res.json({ data });
  })
);

export default router;
