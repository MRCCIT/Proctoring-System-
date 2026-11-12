import { query } from '../../config/database.js';
import { config } from '../../config/index.js';
import { ATTRIBUTION, bucketStart, normalizeMetric } from './metricContract.js';

const MAX_BUFFER = 2000;
const buffer = [];
let flushTimer = null;
let series = new Map(); // key -> { points: number[], timestamps: number[] }

function seriesKey(m) {
  return `${m.tenant_id || 'global'}|${m.service_name}|${m.metric_name}|${m.workload_type || ''}`;
}

/**
 * Safe emit — never throws into request path.
 */
export function emitMetric(partial) {
  try {
    if (!config.observabilityEnabled) return;
    const m = normalizeMetric(partial);
    if (!Number.isFinite(m.metric_value)) return;
    if (buffer.length >= MAX_BUFFER) buffer.shift();
    buffer.push(m);

    const key = seriesKey(m);
    let s = series.get(key);
    if (!s) {
      s = { points: [], timestamps: [] };
      series.set(key, s);
    }
    s.points.push(m.metric_value);
    s.timestamps.push(Date.now());
    if (s.points.length > 120) {
      s.points.shift();
      s.timestamps.shift();
    }

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushRollups().catch(() => {});
      }, config.observabilityFlushMs || 5000);
      flushTimer.unref?.();
    }
  } catch {
    /* never break callers */
  }
}

export function getInMemorySeries(filter = {}) {
  const out = [];
  for (const [key, s] of series.entries()) {
    const [tenant_id, service_name, metric_name, workload_type] = key.split('|');
    if (filter.service_name && service_name !== filter.service_name) continue;
    if (filter.metric_name && metric_name !== filter.metric_name) continue;
    if (filter.tenant_id && tenant_id !== filter.tenant_id) continue;
    out.push({
      tenant_id: tenant_id === 'global' ? null : tenant_id,
      service_name,
      metric_name,
      workload_type: workload_type || null,
      points: s.points.slice(-60),
      timestamps: s.timestamps.slice(-60),
    });
  }
  return out;
}

export function getRecentCounters(serviceName, metricName, windowMs = 60_000) {
  const now = Date.now();
  let sum = 0;
  let count = 0;
  for (const [key, s] of series.entries()) {
    const [, svc, metric] = key.split('|');
    if (svc !== serviceName || metric !== metricName) continue;
    for (let i = 0; i < s.timestamps.length; i++) {
      if (now - s.timestamps[i] <= windowMs) {
        sum += s.points[i];
        count += 1;
      }
    }
  }
  return { sum, count, avg: count ? sum / count : 0 };
}

/**
 * Aggregate buffer into service_metric_rollups (1-minute buckets).
 */
export async function flushRollups() {
  if (!buffer.length) return { flushed: 0 };
  const batch = buffer.splice(0, buffer.length);
  const agg = new Map();
  for (const m of batch) {
    const b = bucketStart(new Date(m.timestamp).getTime(), 60).toISOString();
    const key = `${b}|${m.tenant_id || ''}|${m.service_name}|${m.workload_type || ''}|${m.metric_name}|${m.attribution || ATTRIBUTION.MEASURED}`;
    const cur = agg.get(key) || {
      bucket_start: b,
      tenant_id: m.tenant_id,
      service_name: m.service_name,
      workload_type: m.workload_type,
      metric_name: m.metric_name,
      metric_unit: m.metric_unit,
      attribution: m.attribution || ATTRIBUTION.MEASURED,
      sum: 0,
      count: 0,
    };
    cur.sum += m.metric_value;
    cur.count += 1;
    agg.set(key, cur);
  }

  let flushed = 0;
  for (const row of agg.values()) {
    try {
      await query(
        `INSERT INTO service_metric_rollups
          (bucket_start, bucket_seconds, tenant_id, service_name, workload_type, metric_name, metric_value, metric_unit, sample_count, attribution)
         VALUES ($1::timestamptz, 60, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.bucket_start,
          row.tenant_id,
          row.service_name,
          row.workload_type,
          row.metric_name,
          row.sum / row.count,
          row.metric_unit,
          row.count,
          row.attribution,
        ]
      );
      flushed += 1;
    } catch {
      /* table may not exist yet during boot; drop silently */
    }
  }
  return { flushed };
}

export function __resetAggregatorForTests() {
  buffer.length = 0;
  series = new Map();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
