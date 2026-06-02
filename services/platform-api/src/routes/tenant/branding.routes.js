import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getBranding, upsertBranding } from '../../services/tenant/branding.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await getBranding(req.tenantContext.tenantId);
    res.json({ data });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const data = await upsertBranding(req.tenantContext.tenantId, req.body || {});
    res.json({ data });
  })
);

export default router;
