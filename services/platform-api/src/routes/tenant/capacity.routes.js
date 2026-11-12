import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  getTenantLoadLevel,
  setTenantLoadLevel,
  broadcastLoadLevel,
  policyForLevel,
  recommendAndMaybeSet,
} from '../../services/capacity/loadLevelStore.js';

const router = Router();

router.get(
  '/load-level',
  asyncHandler(async (req, res) => {
    const level = getTenantLoadLevel(req.tenantContext.tenantId);
    res.json({ data: { level, policy: policyForLevel(level) } });
  })
);

router.put(
  '/load-level',
  asyncHandler(async (req, res) => {
    const level = req.body?.level || req.body?.load_level;
    const metrics = { ...req.body, manual: level || req.body?.manual };
    const data = level
      ? setTenantLoadLevel(req.tenantContext.tenantId, level, { manual: true })
      : recommendAndMaybeSet(req.tenantContext.tenantId, metrics);
    const pushed = await broadcastLoadLevel(req.tenantContext.tenantId, null, data.level);
    res.json({ data: { ...data, pushed_to_sessions: pushed } });
  })
);

export default router;
