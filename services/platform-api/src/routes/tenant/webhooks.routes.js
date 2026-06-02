import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listWebhooks, createWebhook } from '../../services/tenant/webhooks.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listWebhooks(req.tenantContext.tenantId);
    res.json({ data: items });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const created = await createWebhook(req.tenantContext.tenantId, req.body || {});
      res.status(201).json({ data: created });
    } catch (e) {
      if (e.status === 422) {
        return res.status(422).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.validation,
            title: 'Validation Error',
            status: 422,
            detail: e.message,
            instance: req.originalUrl,
          })
        );
      }
      throw e;
    }
  })
);

export default router;
