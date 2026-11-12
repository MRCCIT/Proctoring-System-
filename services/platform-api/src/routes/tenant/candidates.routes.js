import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listCandidates } from '../../services/tenant/candidates.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listCandidates(req.tenantContext.tenantId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    res.json({ data: items, next_cursor });
  })
);

export default router;
