/** Lightweight WS connection accounting (updated from sdkSessionWs). */

const state = {
  active_connections: 0,
  total_connected: 0,
  total_disconnected: 0,
  failed_connections: 0,
  heartbeats: 0,
  by_tenant: new Map(),
};

export function wsOnConnect(tenantId) {
  state.active_connections += 1;
  state.total_connected += 1;
  if (tenantId) {
    state.by_tenant.set(tenantId, (state.by_tenant.get(tenantId) || 0) + 1);
  }
}

export function wsOnDisconnect(tenantId) {
  state.active_connections = Math.max(0, state.active_connections - 1);
  state.total_disconnected += 1;
  if (tenantId && state.by_tenant.has(tenantId)) {
    const n = Math.max(0, (state.by_tenant.get(tenantId) || 0) - 1);
    if (n === 0) state.by_tenant.delete(tenantId);
    else state.by_tenant.set(tenantId, n);
  }
}

export function wsOnHeartbeat(tenantId) {
  state.heartbeats += 1;
  void tenantId;
}

export function wsOnFailed() {
  state.failed_connections += 1;
}

export function getWsStats() {
  return {
    active_connections: state.active_connections,
    total_connected: state.total_connected,
    total_disconnected: state.total_disconnected,
    failed_connections: state.failed_connections,
    heartbeats: state.heartbeats,
    tenants_with_connections: state.by_tenant.size,
    by_tenant: Object.fromEntries([...state.by_tenant.entries()].slice(0, 50)),
  };
}
