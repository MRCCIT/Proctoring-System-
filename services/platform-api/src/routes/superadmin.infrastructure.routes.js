import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getInfrastructureHealth } from '../services/infrastructureService.js';
import { getInfrastructureOverview, getServiceDetail } from '../services/observability/overview.js';
import { listInfrastructureTenants, getTenantServiceUsage } from '../services/observability/tenantUsage.js';
import { listInfraNodes, collectHardwareSnapshot, persistHardwareSnapshot } from '../services/observability/hardwareCollector.js';
import { getLaneStats } from '../services/queue/laneStats.js';
import {
  getGlobalPolicies,
  updateGlobalPolicies,
  rollbackGlobalPolicies,
  getTenantPolicies,
  updateTenantPolicies,
  listControlAudit,
} from '../services/observability/policies.js';
import { listAlerts, acknowledgeAlert, resolveAlert } from '../services/observability/alerts.js';
import { listRecommendations, decideRecommendation } from '../services/observability/recommendations.js';
import { getInMemorySeries } from '../services/observability/aggregator.js';
import { setGlobalLoadLevel } from '../services/capacity/loadLevelStore.js';
import { setAiDegradationLevel } from '../services/infra/degradation.js';
import { isUuid } from '../utils/validation.js';

const router = Router();

router.get(
  '/infrastructure/health',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getInfrastructureHealth() });
  })
);

router.get(
  '/infrastructure/overview',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getInfrastructureOverview() });
  })
);

router.get(
  '/infrastructure/services',
  asyncHandler(async (_req, res) => {
    const health = await getInfrastructureHealth();
    res.json({
      data: (health.live || []).map((s) => ({
        name: s.name,
        status: s.status,
        latency_ms: s.latency_ms,
        queue_depth: s.queue_depth,
        details: s.details,
      })),
      controls: health.controls,
      checked_at: health.checked_at,
    });
  })
);

router.get(
  '/infrastructure/services/:service',
  asyncHandler(async (req, res) => {
    res.json({ data: await getServiceDetail(req.params.service) });
  })
);

router.get(
  '/infrastructure/hardware',
  asyncHandler(async (_req, res) => {
    let nodes = await listInfraNodes();
    if (!nodes.length) {
      const snap = await collectHardwareSnapshot();
      await persistHardwareSnapshot(snap);
      nodes = [snap];
    }
    res.json({ data: { nodes, checked_at: new Date().toISOString() } });
  })
);

router.get(
  '/infrastructure/queues',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        ...getLaneStats(),
        series: getInMemorySeries({ service_name: 'queue' }),
        checked_at: new Date().toISOString(),
      },
    });
  })
);

router.get(
  '/infrastructure/tenants',
  asyncHandler(async (_req, res) => {
    res.json({ data: await listInfrastructureTenants() });
  })
);

router.get(
  '/infrastructure/tenants/:tenantId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.tenantId)) return res.status(400).json({ error: 'invalid tenant id' });
    res.json({ data: await getTenantServiceUsage(req.params.tenantId) });
  })
);

router.get(
  '/infrastructure/tenants/:tenantId/usage',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.tenantId)) return res.status(400).json({ error: 'invalid tenant id' });
    res.json({ data: await getTenantServiceUsage(req.params.tenantId) });
  })
);

router.get(
  '/infrastructure/tenants/:tenantId/policies',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.tenantId)) return res.status(400).json({ error: 'invalid tenant id' });
    res.json({ data: await getTenantPolicies(req.params.tenantId) });
  })
);

router.put(
  '/infrastructure/tenants/:tenantId/policies',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.tenantId)) return res.status(400).json({ error: 'invalid tenant id' });
    const data = await updateTenantPolicies(req.params.tenantId, req.body?.policies || req.body || {}, {
      actorId: req.superadmin?.sub,
      actorEmail: req.superadmin?.email,
      reason: req.body?.reason,
    });
    res.json({ data });
  })
);

router.get(
  '/infrastructure/global-policies',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getGlobalPolicies() });
  })
);

router.put(
  '/infrastructure/global-policies',
  asyncHandler(async (req, res) => {
    const patch = req.body?.policies || req.body || {};
    if (patch.load_level_manual && patch.load_level) {
      setGlobalLoadLevel(patch.load_level, { manual: true });
    }
    if (patch.ai_degradation_manual && patch.ai_degradation_level != null) {
      await setAiDegradationLevel(patch.ai_degradation_level);
    }
    const data = await updateGlobalPolicies(patch, {
      actorId: req.superadmin?.sub,
      actorEmail: req.superadmin?.email,
      reason: req.body?.reason,
    });
    res.json({ data });
  })
);

router.post(
  '/infrastructure/controls/rollback',
  asyncHandler(async (req, res) => {
    const data = await rollbackGlobalPolicies({
      actorId: req.superadmin?.sub,
      actorEmail: req.superadmin?.email,
      reason: req.body?.reason || 'rollback',
    });
    res.json({ data });
  })
);

router.get(
  '/infrastructure/alerts',
  asyncHandler(async (req, res) => {
    res.json({
      data: await listAlerts({
        status: req.query.status,
        severity: req.query.severity,
        limit: req.query.limit,
      }),
    });
  })
);

router.post(
  '/infrastructure/alerts/:id/acknowledge',
  asyncHandler(async (req, res) => {
    const row = await acknowledgeAlert(req.params.id, { actor: req.superadmin?.email || req.superadmin?.sub });
    if (!row) return res.status(404).json({ error: 'alert not found or not open' });
    res.json({ data: row });
  })
);

router.post(
  '/infrastructure/alerts/:id/resolve',
  asyncHandler(async (req, res) => {
    const row = await resolveAlert(req.params.id, { actor: req.superadmin?.email || req.superadmin?.sub });
    if (!row) return res.status(404).json({ error: 'alert not found' });
    res.json({ data: row });
  })
);

router.get(
  '/infrastructure/recommendations',
  asyncHandler(async (req, res) => {
    res.json({ data: await listRecommendations({ status: req.query.status, limit: req.query.limit }) });
  })
);

router.post(
  '/infrastructure/recommendations/:id/approve',
  asyncHandler(async (req, res) => {
    const row = await decideRecommendation(req.params.id, 'approve', {
      actor: req.superadmin?.email || req.superadmin?.sub,
    });
    if (!row) return res.status(404).json({ error: 'recommendation not found' });
    res.json({ data: row });
  })
);

router.post(
  '/infrastructure/recommendations/:id/reject',
  asyncHandler(async (req, res) => {
    const row = await decideRecommendation(req.params.id, 'reject', {
      actor: req.superadmin?.email || req.superadmin?.sub,
    });
    if (!row) return res.status(404).json({ error: 'recommendation not found' });
    res.json({ data: row });
  })
);

router.get(
  '/infrastructure/audit-logs',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listControlAudit({
      cursor: req.query.next_cursor,
      limit: req.query.limit,
      tenant_id: req.query.tenant_id,
    });
    res.json({ data: items, next_cursor });
  })
);

router.get(
  '/infrastructure/history',
  asyncHandler(async (req, res) => {
    const series = getInMemorySeries({
      service_name: req.query.service_name,
      metric_name: req.query.metric_name,
      tenant_id: req.query.tenant_id,
    });
    res.json({ data: { series, checked_at: new Date().toISOString() } });
  })
);

export default router;
