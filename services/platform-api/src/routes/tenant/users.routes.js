import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import {
  listTenantUsers,
  createTenantUser,
  updateTenantUser,
  deleteTenantUser,
  defaultPermissions,
} from '../../services/tenant/tenantUsers.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await listTenantUsers(req.tenantContext.tenantId);
    res.json({ data });
  })
);

router.get(
  '/_defaults',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        roles: ['admin', 'sub_admin', 'proctor', 'viewer'],
        defaults: {
          admin: defaultPermissions('admin'),
          sub_admin: defaultPermissions('sub_admin'),
          proctor: defaultPermissions('proctor'),
          viewer: defaultPermissions('viewer'),
        },
      },
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const data = await createTenantUser(req.tenantContext.tenantId, req.body || {});
      res.status(201).json({ data });
    } catch (e) {
      const status = e.status || 500;
      if (status === 422 || status === 409) {
        return res.status(status).type('application/problem+json').json(
          problemDetails({
            type: status === 409 ? ProblemTypes.conflict : ProblemTypes.validation,
            title: status === 409 ? 'Conflict' : 'Validation Error',
            status,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid user id',
        })
      );
    }
    try {
      const data = await updateTenantUser(req.tenantContext.tenantId, req.params.id, req.body || {});
      res.json({ data });
    } catch (e) {
      const status = e.status || 500;
      if (status === 404 || status === 422) {
        return res.status(status).type('application/problem+json').json(
          problemDetails({
            type: status === 404 ? ProblemTypes.notFound : ProblemTypes.validation,
            title: status === 404 ? 'Not Found' : 'Validation Error',
            status,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid user id',
        })
      );
    }
    const ok = await deleteTenantUser(req.tenantContext.tenantId, req.params.id);
    if (!ok) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Tenant user not found',
        })
      );
    }
    res.status(204).end();
  })
);

export default router;
