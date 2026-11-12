/**
 * Internal metric contract for Observability Engine.
 * Prefer batched aggregation over per-request HTTP. Avoid high-cardinality Prometheus labels.
 */

export const SERVICES = [
  'platform_api',
  'websocket',
  'postgres',
  'redis',
  'media',
  'ai_sidecar',
  'queue',
  'admission',
  'hardware',
];

export const ATTRIBUTION = {
  MEASURED: 'measured',
  ATTRIBUTED: 'attributed',
  ESTIMATED: 'estimated',
  NA: 'n/a',
};

/**
 * @param {object} partial
 */
export function normalizeMetric(partial = {}) {
  const now = new Date().toISOString();
  return {
    tenant_id: partial.tenant_id ?? null,
    service_name: String(partial.service_name || 'unknown'),
    workload_type: partial.workload_type ?? null,
    operation_name: partial.operation_name ?? null,
    request_id: partial.request_id ?? null,
    job_id: partial.job_id ?? null,
    metric_name: String(partial.metric_name || 'unknown'),
    metric_value: Number(partial.metric_value),
    metric_unit: partial.metric_unit ?? null,
    timestamp: partial.timestamp || now,
    source: partial.source || 'platform-api',
    status: partial.status || 'ok',
    environment: partial.environment || process.env.NODE_ENV || 'development',
    node_id: partial.node_id || process.env.HOSTNAME || 'local',
    attribution: partial.attribution || ATTRIBUTION.MEASURED,
  };
}

export function bucketStart(ts = Date.now(), bucketSeconds = 60) {
  const ms = bucketSeconds * 1000;
  return new Date(Math.floor(ts / ms) * ms);
}
