import { query } from '../../config/database.js';
import { getTenantById } from '../tenantService.js';
import { getTenantUsageAnalytics, getTenantViolationsAnalytics } from '../tenant/analytics.js';
import { getTenantPolicies } from './policies.js';
import { getWsStats } from '../../ws/wsStats.js';
import { getLaneStats } from '../queue/laneStats.js';
import { getRecentCounters } from './aggregator.js';
import { ATTRIBUTION } from './metricContract.js';
import { isRedisEnabled } from '../../config/redis.js';

export async function listInfrastructureTenants() {
  const { rows } = await query(
    `SELECT t.id, t.name, t.slug, t.status, t.quotas, t.feature_flags,
            (SELECT COUNT(*)::int FROM exam_sessions s WHERE s.tenant_id = t.id AND s.status IN ('active','paused')) AS live_sessions,
            (SELECT COALESCE(SUM(storage_bytes),0)::bigint FROM exam_sessions s WHERE s.tenant_id = t.id) AS storage_bytes,
            (SELECT COALESCE(SUM(bytes_egress),0)::bigint FROM exam_sessions s WHERE s.tenant_id = t.id) AS egress_bytes,
            (SELECT COALESCE(SUM(violation_flags),0)::bigint FROM exam_sessions s WHERE s.tenant_id = t.id) AS violation_flags
       FROM tenants t
       ORDER BY live_sessions DESC, t.name ASC`
  );
  const ws = getWsStats();
  const lanes = getLaneStats();
  let alertCounts = {};
  try {
    const { rows: a } = await query(
      `SELECT tenant_id, COUNT(*)::int AS n FROM monitoring_alerts
        WHERE status IN ('open','acknowledged') AND tenant_id IS NOT NULL
        GROUP BY tenant_id`
    );
    alertCounts = Object.fromEntries(a.map((r) => [r.tenant_id, r.n]));
  } catch {
    alertCounts = {};
  }

  return rows.map((r) => {
    const maxConc = Number(r.quotas?.max_concurrent_sessions || 100);
    const storageMb = Number(r.quotas?.storage_mb || 10240);
    const storageUsedMb = Number(r.storage_bytes || 0) / (1024 * 1024);
    return {
      tenant_id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      live_sessions: r.live_sessions,
      session_quota_util: maxConc ? r.live_sessions / maxConc : null,
      api_requests_1m: null,
      api_attribution: ATTRIBUTION.NA,
      websocket_connections: ws.by_tenant?.[r.id] || 0,
      storage_bytes: String(r.storage_bytes),
      storage_quota_util: storageMb ? storageUsedMb / storageMb : null,
      egress_bytes: String(r.egress_bytes),
      ai_jobs: null,
      ai_attribution: ATTRIBUTION.ESTIMATED,
      queue_backlog: lanes.by_tenant_sample?.[r.id] || null,
      alerts: alertCounts[r.id] || 0,
      quotas: r.quotas,
      feature_flags: r.feature_flags,
    };
  });
}

export async function getTenantServiceUsage(tenantId) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    const e = new Error('Tenant not found');
    e.status = 404;
    throw e;
  }
  const [usage, violations, policies] = await Promise.all([
    getTenantUsageAnalytics(tenantId),
    getTenantViolationsAnalytics(tenantId),
    getTenantPolicies(tenantId),
  ]);
  const ws = getWsStats();
  const lanes = getLaneStats();
  const apiRpm = getRecentCounters('platform_api', 'request_count', 60_000);
  // Global RPM cannot be fully attributed without denser tags — mark estimated share by live sessions.
  const liveShare =
    Number(usage.totals.active_sessions || 0) /
    Math.max(1, Number((await query(`SELECT COUNT(*)::int AS n FROM exam_sessions WHERE status IN ('active','paused')`)).rows[0]?.n || 1));

  const maxConc = Number(policies.policies.max_concurrent_sessions || 100);
  const storageMb = Number(policies.policies.storage_mb || 10240);
  const storageBytes = Number(usage.totals.storage_bytes || 0);
  const wsConn = ws.by_tenant?.[tenantId] || 0;
  const maxWs = Number(policies.policies.max_websocket_connections || 200);
  const egressMb = Number(usage.totals.bytes_egress || 0) / (1024 * 1024);
  const egressQuota = Number(policies.policies.daily_egress_mb || 51200);
  const aiConc = Number(policies.policies.ai_concurrency || 8);

  const services = [
    {
      service: 'platform_api',
      current: Math.round(apiRpm.sum * liveShare),
      quota: policies.policies.api_requests_per_minute,
      unit: 'req/min (est.)',
      utilization: policies.policies.api_requests_per_minute
        ? (apiRpm.sum * liveShare) / policies.policies.api_requests_per_minute
        : null,
      attribution: ATTRIBUTION.ESTIMATED,
      status: 'ok',
    },
    {
      service: 'websocket',
      current: wsConn,
      quota: maxWs,
      unit: 'connections',
      utilization: maxWs ? wsConn / maxWs : null,
      attribution: ATTRIBUTION.ATTRIBUTED,
      status: maxWs && wsConn >= maxWs ? 'critical' : 'ok',
    },
    {
      service: 'admission',
      current: usage.totals.active_sessions,
      quota: maxConc,
      unit: 'live sessions',
      utilization: maxConc ? usage.totals.active_sessions / maxConc : null,
      attribution: ATTRIBUTION.MEASURED,
      status: maxConc && usage.totals.active_sessions >= maxConc ? 'critical' : 'ok',
    },
    {
      service: 'media',
      current: storageBytes,
      quota: storageMb * 1024 * 1024,
      unit: 'storage used / quota',
      value_kind: 'bytes',
      utilization: storageMb ? storageBytes / (storageMb * 1024 * 1024) : null,
      attribution: ATTRIBUTION.MEASURED,
      status: 'ok',
      hint: `Egress ${formatBytesHint(usage.totals.bytes_egress)} · daily limit ~${egressQuota} MB`,
      extras: { egress_bytes: usage.totals.bytes_egress, egress_util: egressQuota ? egressMb / egressQuota : null },
    },
    {
      service: 'ai_sidecar',
      current: null,
      quota: aiConc,
      unit: 'AI concurrency slots',
      utilization: null,
      attribution: ATTRIBUTION.NA,
      status: 'ok',
      hint: 'Per-tenant AI job concurrency is not sampled yet',
      extras: { features: policies.policies.ai_features },
    },
    {
      service: 'queue',
      current: null,
      quota: null,
      unit: 'background jobs',
      utilization: null,
      attribution: lanes.by_tenant_sample?.[tenantId] ? ATTRIBUTION.ATTRIBUTED : ATTRIBUTION.NA,
      status: 'ok',
      hint: lanes.by_tenant_sample?.[tenantId]
        ? `Lane sample: ${JSON.stringify(lanes.by_tenant_sample[tenantId])}`
        : 'No per-tenant queue backlog sampled yet',
    },
    {
      service: 'postgres',
      current: null,
      quota: null,
      unit: null,
      utilization: null,
      attribution: ATTRIBUTION.NA,
      hint: 'Postgres does not expose exact per-tenant storage/CPU',
      status: 'ok',
    },
    redisServiceCard(maxConc, usage.totals.active_sessions),
  ];

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      priority: policies.policies.priority,
    },
    policies: policies.policies,
    usage,
    violations,
    services,
  };
}

function formatBytesHint(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(2)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  return `${(b / 1024 ** 4).toFixed(2)} TB`;
}

/** Redis is for live counters/cache — never show recording storage here. */
function redisServiceCard(maxConc, liveSessions) {
  if (!isRedisEnabled()) {
    return {
      service: 'redis',
      current: null,
      quota: null,
      unit: null,
      utilization: null,
      attribution: ATTRIBUTION.NA,
      status: 'unavailable',
      hint: 'Redis is not configured — session counters use DB fallback. Recording storage is under Media.',
    };
  }
  return {
    service: 'redis',
    current: Number(liveSessions || 0),
    quota: maxConc,
    unit: 'live session counter keys',
    utilization: maxConc ? Number(liveSessions || 0) / maxConc : null,
    attribution: ATTRIBUTION.ATTRIBUTED,
    status: 'ok',
    hint: 'Redis tracks concurrent session counters only — not media/recording storage',
  };
}
