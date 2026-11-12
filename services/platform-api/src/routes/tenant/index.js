import { Router } from 'express';
import { requireTenantContext } from '../../middleware/tenantContext.js';
import { tenantAuthRouter } from './auth.routes.js';
import examsRoutes from './exams.routes.js';
import lockdownRoutes from './lockdown.routes.js';
import sessionsRoutes from './sessions.routes.js';
import candidatesRoutes from './candidates.routes.js';
import analyticsRoutes from './analytics.routes.js';
import reportsRoutes from './reports.routes.js';
import webhooksRoutes from './webhooks.routes.js';
import tenantSdkRoutes from './tenantSdk.routes.js';
import brandingRoutes from './branding.routes.js';
import usersRoutes from './users.routes.js';
import { policiesRouter, sessionTemplatesRouter } from './policies.routes.js';
import assignmentsRoutes from './assignments.routes.js';
import { overviewRouter, accessLinksRouter } from './overview.routes.js';
import aiHealthRoutes from './aiHealth.routes.js';
import capacityRoutes from './capacity.routes.js';

export function registerTenantHttpRoutes(app) {
  app.use('/v1/tenant/auth', tenantAuthRouter);

  const tenantApi = Router();
  tenantApi.use(requireTenantContext);
  tenantApi.use('/exams', examsRoutes);
  tenantApi.use('/exams', lockdownRoutes); // GET|PUT /exams/:examId/lockdown-policy
  tenantApi.use('/sessions', sessionsRoutes);
  tenantApi.use('/candidates', candidatesRoutes);
  tenantApi.use('/analytics', analyticsRoutes);
  tenantApi.use('/reports', reportsRoutes);
  tenantApi.use('/webhooks', webhooksRoutes);
  tenantApi.use('/tenant/sdk', tenantSdkRoutes);
  tenantApi.use('/tenant/branding', brandingRoutes);
  tenantApi.use('/tenant/users', usersRoutes);
  tenantApi.use('/policy-templates', policiesRouter);
  tenantApi.use('/session-templates', sessionTemplatesRouter);
  tenantApi.use('/proctor-assignments', assignmentsRoutes);
  tenantApi.use('/tenant/overview', overviewRouter);
  tenantApi.use('/tenant/ai-health', aiHealthRoutes);
  tenantApi.use('/tenant', capacityRoutes);
  tenantApi.use('/access-links', accessLinksRouter);

  app.use('/v1', tenantApi);
}
