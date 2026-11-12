/** In-process lane decision counters (safe, bounded). */

const lanes = {
  P0: { allowed: 0, deferred: 0, shed: 0, pending: 0 },
  P1: { allowed: 0, deferred: 0, shed: 0, pending: 0 },
  P2: { allowed: 0, deferred: 0, shed: 0, pending: 0 },
  P3: { allowed: 0, deferred: 0, shed: 0, pending: 0 },
  P4: { allowed: 0, deferred: 0, shed: 0, pending: 0 },
};

const byTenant = new Map();

export function recordLaneDecision(lane, { allow, deferred, tenantId } = {}) {
  const L = lanes[lane] || lanes.P3;
  if (allow) L.allowed += 1;
  if (deferred) {
    L.deferred += 1;
    L.shed += 1;
  }
  if (tenantId) {
    let t = byTenant.get(tenantId);
    if (!t) {
      t = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
      byTenant.set(tenantId, t);
    }
    t[lane] = (t[lane] || 0) + 1;
    if (byTenant.size > 500) {
      const first = byTenant.keys().next().value;
      byTenant.delete(first);
    }
  }
}

export function getLaneStats() {
  return {
    lanes: JSON.parse(JSON.stringify(lanes)),
    tenants_tracked: byTenant.size,
    by_tenant_sample: Object.fromEntries([...byTenant.entries()].slice(0, 20)),
  };
}

export function __resetLaneStatsForTests() {
  for (const k of Object.keys(lanes)) {
    lanes[k] = { allowed: 0, deferred: 0, shed: 0, pending: 0 };
  }
  byTenant.clear();
}
