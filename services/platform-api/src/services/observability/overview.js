import { query } from '../../config/database.js';
import { getPlatformAnalytics, getTenantsCompare } from '../analyticsService.js';
import { collectLiveProbes } from './liveProbes.js';
import { getRecentCounters, getInMemorySeries } from './aggregator.js';
import { getWsStats } from '../../ws/wsStats.js';
import { getLaneStats } from '../queue/laneStats.js';
import { listInfraNodes, collectHardwareSnapshot } from './hardwareCollector.js';
import { getGlobalPolicies } from './policies.js';
import { ATTRIBUTION } from './metricContract.js';

export async function getInfrastructureOverview() {
  const [platform, probes, nodes, policies, compare] = await Promise.all([
    getPlatformAnalytics(),
    collectLiveProbes(),
    listInfraNodes(),
    getGlobalPolicies(),
    getTenantsCompare().catch(() => []),
  ]);

  let openAlerts = 0;
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM monitoring_alerts WHERE status IN ('open','acknowledged')`
    );
    openAlerts = rows[0]?.n || 0;
  } catch {
    openAlerts = 0;
  }

  const ws = getWsStats();
  const lanes = getLaneStats();
  const rpm = getRecentCounters('platform_api', 'request_count', 60_000).sum;
  const pendingJobs = Object.values(lanes.lanes || {}).reduce(
    (n, l) => n + Number(l.deferred || 0) + Number(l.pending || 0),
    0
  );

  let hardware = nodes[0] || null;
  if (!hardware) {
    try {
      hardware = await collectHardwareSnapshot();
    } catch {
      hardware = null;
    }
  }

  const series = {
    api_rpm: seriesFromMemory('platform_api', 'request_count'),
    sessions: (platform.sessions_per_day || []).map((d) => ({
      t: d.day,
      v: d.sessions_started,
    })),
    request_latency: seriesFromMemory('platform_api', 'request_duration'),
  };

  return {
    checked_at: new Date().toISOString(),
    summary: {
      total_tenants: platform.summary.total_tenants,
      active_tenants: platform.summary.active_tenants,
      live_sessions: platform.summary.active_sessions,
      api_requests_per_minute: rpm,
      websocket_connections: ws.active_connections,
      pending_queue_jobs: pendingJobs,
      total_storage_bytes: platform.summary.total_storage_bytes,
      total_egress_bytes: platform.summary.total_egress_bytes,
      open_incidents: openAlerts,
      load_level: probes.controls?.load_level || policies.policies.load_level,
      ai_degradation_level: probes.controls?.ai_degradation_level ?? policies.policies.ai_degradation_level,
    },
    hardware: hardware
      ? {
          node_id: hardware.id || hardware.hostname,
          cpu_pct: hardware.cpu_pct ?? null,
          ram_pct: hardware.ram_pct ?? null,
          disk_pct: hardware.disk_pct ?? null,
          gpu_util_pct: Array.isArray(hardware.gpu) && hardware.gpu[0] ? hardware.gpu[0].utilization_pct : null,
          gpu_memory_pct:
            Array.isArray(hardware.gpu) && hardware.gpu[0]?.memory_total_mb
              ? Math.round((hardware.gpu[0].memory_used_mb / hardware.gpu[0].memory_total_mb) * 1000) / 10
              : null,
          network_rx_bps: hardware.network_rx_bps ?? null,
          network_tx_bps: hardware.network_tx_bps ?? null,
          unavailable: hardware.details?.unavailable || {
            gpu: !hardware.gpu,
            network: hardware.network_rx_bps == null,
            disk: hardware.disk_pct == null,
          },
        }
      : {
          cpu_pct: null,
          ram_pct: null,
          disk_pct: null,
          gpu_util_pct: null,
          unavailable: { all: true },
        },
    services: (probes.live || []).map((s) => ({
      name: s.name,
      status: s.status,
      latency_ms: s.latency_ms,
      queue_depth: s.queue_depth,
      href: `/infrastructure/services?service=${encodeURIComponent(s.name)}`,
    })),
    series,
    top_tenants: (compare || [])
      .slice()
      .sort((a, b) => Number(b.active_sessions || 0) - Number(a.active_sessions || 0))
      .slice(0, 5)
      .map((t) => ({
        tenant_id: t.tenant_id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        live_sessions: t.active_sessions,
        storage_bytes: t.storage_bytes,
        attribution: ATTRIBUTION.MEASURED,
      })),
    policies: {
      version: policies.version,
      load_level: policies.policies.load_level,
      ai_degradation_level: policies.policies.ai_degradation_level,
      optimization_mode: policies.policies.optimization_mode,
    },
  };
}

function seriesFromMemory(service, metric) {
  const rows = getInMemorySeries({ service_name: service, metric_name: metric });
  if (!rows.length) return [];
  const merged = [];
  for (const r of rows) {
    r.timestamps.forEach((t, i) => {
      merged.push({ t: new Date(t).toISOString(), v: r.points[i] });
    });
  }
  return merged.slice(-60);
}

export async function getServiceDetail(serviceName) {
  const probes = await collectLiveProbes();
  const live = (probes.live || []).find((s) => s.name === serviceName) || null;
  const series = getInMemorySeries({ service_name: serviceName });
  let rollups = [];
  try {
    const { rows } = await query(
      `SELECT bucket_start, metric_name, metric_value, sample_count, attribution, tenant_id
         FROM service_metric_rollups
        WHERE service_name = $1 AND bucket_start > now() - interval '2 hours'
        ORDER BY bucket_start DESC
        LIMIT 200`,
      [serviceName]
    );
    rollups = rows;
  } catch {
    rollups = [];
  }

  let tenantBreakdown = [];
  if (serviceName === 'media' || serviceName === 'admission') {
    const compare = await getTenantsCompare().catch(() => []);
    tenantBreakdown = (compare || []).map((t) => ({
      tenant_id: t.tenant_id,
      name: t.name,
      live_sessions: t.active_sessions,
      storage_bytes: t.storage_bytes,
      attribution: ATTRIBUTION.MEASURED,
    }));
  } else if (serviceName === 'websocket') {
    const ws = getWsStats();
    tenantBreakdown = Object.entries(ws.by_tenant || {}).map(([tenant_id, n]) => ({
      tenant_id,
      connections: n,
      attribution: ATTRIBUTION.ATTRIBUTED,
    }));
  } else if (serviceName === 'queue') {
    tenantBreakdown = Object.entries(getLaneStats().by_tenant_sample || {}).map(([tenant_id, lanes]) => ({
      tenant_id,
      lanes,
      attribution: ATTRIBUTION.ATTRIBUTED,
    }));
  }

  return {
    service: serviceName,
    live,
    series,
    rollups,
    tenant_breakdown: tenantBreakdown,
    controls: probes.controls,
  };
}
