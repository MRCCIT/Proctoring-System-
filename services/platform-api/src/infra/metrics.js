import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

try {
  collectDefaultMetrics({ register });
} catch (e) {
  console.warn('[metrics] default metrics disabled:', e.message);
}

export const httpRequestDuration = new Histogram({
  name: 'proctorshield_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const aiJobsQueued = new Counter({
  name: 'proctorshield_ai_jobs_queued_total',
  help: 'AI jobs enqueued',
  registers: [register],
});

export const activeSessionsGauge = new Gauge({
  name: 'proctorshield_active_sessions',
  help: 'Approximate active sessions per tenant',
  labelNames: ['tenant_id'],
  registers: [register],
});
