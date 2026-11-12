import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import { tenantOverview } from '../../services/tenant/sessionQueries.js';
import {
  listAccessLinks,
  createAccessLink,
  setAccessLinkActive,
} from '../../services/integration/accessLinks.js';

export const overviewRouter = Router();
export const accessLinksRouter = Router();

function actorFromCtx(ctx) {
  if (!ctx) return null;
  return ctx.authMode === 'jwt'
    ? { type: 'tenant_user', id: ctx.userId, email: ctx.email }
    : { type: 'api_key', id: ctx.tenantSlug };
}

overviewRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await tenantOverview(req.tenantContext.tenantId);
    res.json({ data });
  })
);

accessLinksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await listAccessLinks(req.tenantContext.tenantId, {
      exam_id: req.query.exam_id,
    });
    res.json({ data });
  })
);

accessLinksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const data = await createAccessLink(req.tenantContext.tenantId, req.body || {}, actorFromCtx(req.tenantContext));
      res.status(201).json({ data });
    } catch (e) {
      if (e.status === 404 || e.status === 422) {
        return res.status(e.status).type('application/problem+json').json(
          problemDetails({
            type: e.status === 422 ? ProblemTypes.validation : ProblemTypes.notFound,
            title: e.status === 422 ? 'Validation Error' : 'Not Found',
            status: e.status,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

accessLinksRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid access link id',
        })
      );
    }
    const body = req.body || {};
    if (typeof body.is_active !== 'boolean') {
      return res.status(422).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 422,
          detail: 'is_active (boolean) is required',
        })
      );
    }
    const data = await setAccessLinkActive(req.tenantContext.tenantId, req.params.id, body.is_active);
    if (!data) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Access link not found',
        })
      );
    }
    res.json({ data });
  })
);
