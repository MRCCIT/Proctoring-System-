import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireSuperAdminJwt } from '../middleware/auth.js';
import { loginSuperAdmin } from '../services/authService.js';
import {
  listTenants,
  getTenantById,
  createTenant,
  updateTenant,
  suspendTenant,
  rotateTenantApiKey,
} from '../services/tenantService.js';
import { listActiveSessions, getSessionById } from '../services/sessionService.js';
import { getPlatformAnalytics, getTenantsCompare } from '../services/analyticsService.js';
import { listAuditLogs } from '../services/auditService.js';
import { getInfrastructureHealth } from '../services/infrastructureService.js';
import { writeAuditLog } from '../services/auditLogWriter.js';
import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { isUuid } from '../utils/validation.js';

const router = Router();

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const result = await loginSuperAdmin(email, password);
    res.json(result);
  })
);

router.use(requireSuperAdminJwt);

router.get(
  '/tenants',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listTenants({
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    res.json({ data: items, next_cursor });
  })
);

router.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    try {
      const { tenant, api_key } = await createTenant(req.body || {});
      await writeAuditLog({
        actorType: 'superadmin',
        actorId: req.superadmin.sub,
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: tenant.id,
        tenantId: tenant.id,
        details: { slug: tenant.slug },
      });
      res.status(201).json({ data: tenant, api_key });
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        return res.status(e.status).type('application/problem+json').json(
          problemDetails({
            type: e.status === 409 ? ProblemTypes.conflict : ProblemTypes.validation,
            title: e.status === 409 ? 'Conflict' : 'Validation Error',
            status: e.status,
            detail: e.message,
            instance: req.originalUrl,
          })
        );
      }
      throw e;
    }
  })
);

router.get(
  '/tenants/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid tenant id',
        })
      );
    }
    const tenant = await getTenantById(req.params.id);
    if (!tenant) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Tenant not found',
        })
      );
    }
    res.json({ data: tenant });
  })
);

router.patch(
  '/tenants/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid tenant id',
        })
      );
    }
    try {
      const tenant = await updateTenant(req.params.id, req.body || {});
      await writeAuditLog({
        actorType: 'superadmin',
        actorId: req.superadmin.sub,
        action: 'tenant.updated',
        resourceType: 'tenant',
        resourceId: req.params.id,
        tenantId: req.params.id,
        details: { fields: Object.keys(req.body || {}) },
      });
      res.json({ data: tenant });
    } catch (e) {
      if (e.status === 404 || e.status === 422) {
        return res.status(e.status).type('application/problem+json').json(
          problemDetails({
            type: e.status === 422 ? ProblemTypes.validation : ProblemTypes.notFound,
            title: e.status === 422 ? 'Validation Error' : 'Not Found',
            status: e.status,
            detail: e.message,
            instance: req.originalUrl,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/tenants/:id/suspend',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid tenant id',
        })
      );
    }
    try {
      const tenant = await suspendTenant(req.params.id);
      await writeAuditLog({
        actorType: 'superadmin',
        actorId: req.superadmin.sub,
        action: 'tenant.suspended',
        resourceType: 'tenant',
        resourceId: req.params.id,
        tenantId: req.params.id,
        details: {},
      });
      res.json({ data: tenant });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/tenants/:id/rotate-key',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid tenant id',
        })
      );
    }
    try {
      const { tenant, api_key } = await rotateTenantApiKey(req.params.id);
      await writeAuditLog({
        actorType: 'superadmin',
        actorId: req.superadmin.sub,
        action: 'tenant.api_key_rotated',
        resourceType: 'tenant',
        resourceId: req.params.id,
        tenantId: req.params.id,
        details: {},
      });
      res.json({ data: tenant, api_key });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.get(
  '/sessions/active',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listActiveSessions({
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    res.json({ data: items, next_cursor });
  })
);

router.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const session = await getSessionById(req.params.id);
    if (!session) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Session not found',
        })
      );
    }
    res.json({ data: session });
  })
);

router.get(
  '/analytics/platform',
  asyncHandler(async (_req, res) => {
    const data = await getPlatformAnalytics();
    res.json({ data });
  })
);

router.get(
  '/analytics/tenants/compare',
  asyncHandler(async (_req, res) => {
    const data = await getTenantsCompare();
    res.json({ data });
  })
);

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listAuditLogs({
      cursor: req.query.next_cursor,
      limit: req.query.limit,
      tenant_id: req.query.tenant_id,
      action: req.query.action,
    });
    res.json({ data: items, next_cursor });
  })
);

router.get(
  '/infrastructure/health',
  asyncHandler(async (_req, res) => {
    const data = await getInfrastructureHealth();
    res.json({ data });
  })
);

export default router;
