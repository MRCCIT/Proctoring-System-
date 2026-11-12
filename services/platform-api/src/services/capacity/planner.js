/** Pure capacity planner — no I/O. See docs/performance-elasticity.md */

export const CAPACITY_MODEL = {
  sessionsPerApiReplica: 1500,
  wsPerReplica: 2000,
  apiReqPerSessionPerMin: 10,
  mediaMbpsPerSession: 0.65,
  headroomL: 1.25,
  headroomXL: 1.25,
};

export function tierFor(n) {
  if (n <= 1000) return 'S';
  if (n <= 10000) return 'M';
  if (n <= 50000) return 'L';
  return 'XL';
}

export function planCapacity(nCandidates, overrides = {}) {
  const n = Math.max(0, Math.floor(Number(nCandidates) || 0));
  const m = { ...CAPACITY_MODEL, ...overrides };
  const tier = tierFor(n);
  const headroom = tier === 'S' || tier === 'M' ? 1 : tier === 'L' ? m.headroomL : m.headroomXL;
  const api = Math.max(1, Math.ceil((n / m.sessionsPerApiReplica) * headroom));
  const ws = tier === 'S' || tier === 'M' ? 0 : Math.max(1, Math.ceil((n / m.wsPerReplica) * headroom));
  const apiRps = Math.round((n * m.apiReqPerSessionPerMin) / 60);
  const ingressGbps = Math.round(((n * m.mediaMbpsPerSession) / 1000) * 100) / 100;
  const warnings = [];
  if (tier === 'S' && n > 200) warnings.push('S tier unproven above ~200 concurrent without soak tests');
  if (n > 200000) warnings.push('Beyond model; redesign sharding');
  return {
    n,
    tier,
    topology:
      tier === 'S' ? 'single_node' : tier === 'M' ? 'single_instance_hardened' : tier === 'L' ? 'horizontal_small' : 'horizontal_fleet',
    replicas: {
      api,
      ws_gateway: ws,
      telemetry_workers: tier === 'S' ? 0 : Math.max(1, Math.ceil(n / 25000)),
      gpu_ai: tier === 'S' ? 0 : Math.max(1, Math.ceil(n / 4000)),
      merge_ffmpeg: tier === 'S' ? 0 : Math.max(1, Math.ceil(n / 2000)),
      pgbouncer: tier === 'S' ? 0 : tier === 'M' ? 1 : Math.max(2, Math.ceil(n / 40000)),
      redis_shards: tier === 'S' ? 0 : tier === 'M' ? 1 : Math.max(2, Math.ceil(n / 20000)),
      read_replicas: tier === 'S' || tier === 'M' ? 0 : Math.max(2, Math.ceil(n / 30000)),
    },
    expected: {
      ws_connections: Math.round(n * 1.05),
      api_rps: apiRps,
      snapshot_uploads_per_s: Math.round(n / 20),
      ingress_gbps: ingressGbps,
    },
    warnings,
  };
}
