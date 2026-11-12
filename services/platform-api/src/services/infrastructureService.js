import { query } from '../config/database.js';
import { collectLiveProbes } from './observability/liveProbes.js';

export async function getInfrastructureHealth() {
  const { rows: db } = await query(`SELECT 1 AS ok`);
  const dbHealthy = db[0]?.ok === 1;

  const { rows: services } = await query(`
    SELECT DISTINCT ON (service_name)
      service_name,
      status,
      latency_ms,
      queue_depth,
      details,
      recorded_at
    FROM infrastructure_snapshots
    ORDER BY service_name, recorded_at DESC
  `);

  let live = [];
  let controls = {};
  try {
    const probes = await collectLiveProbes();
    live = probes.live || [];
    controls = probes.controls || {};
  } catch {
    live = [];
  }

  return {
    checked_at: new Date().toISOString(),
    database: { status: dbHealthy ? 'healthy' : 'unhealthy' },
    live,
    controls,
    services: services.map((s) => ({
      name: s.service_name,
      status: s.status,
      latency_ms: s.latency_ms,
      queue_depth: s.queue_depth,
      details: s.details,
      last_recorded_at: s.recorded_at,
    })),
  };
}
