import { fetchAiHealth, getAiGatewayStats } from '../ai/aiClient.js';
import { getCapacitySnapshot, setSoftConcurrencyLimit } from '../infra/admissionControl.js';
import { query } from '../../config/database.js';

export async function getTenantAiHealth(tenantId) {
  const [ai, capacity, recent] = await Promise.all([
    fetchAiHealth(),
    getCapacitySnapshot(tenantId),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS sessions_1h,
         COUNT(*) FILTER (WHERE status IN ('active','paused'))::int AS live_now,
         COALESCE(SUM(violation_flags) FILTER (WHERE created_at > now() - interval '1 hour'), 0)::bigint AS flags_1h
       FROM exam_sessions
       WHERE tenant_id = $1`,
      [tenantId]
    ),
  ]);

  const body = ai.body || {};
  const concurrency = body.concurrency || null;
  const throughput = body.throughput || null;
  const models = body.models || {
    ready: body.models_ready,
    yolo_model: body.yolo_model,
    electronics_yolo_model: body.electronics_yolo_model,
  };

  let aiStatus = 'down';
  if (ai.reachable) {
    aiStatus = body.health || body.status || 'healthy';
    if (aiStatus === 'ok') aiStatus = 'healthy';
  }

  return {
    checked_at: new Date().toISOString(),
    ai: {
      status: aiStatus,
      reachable: ai.reachable,
      latency_ms: ai.latency_ms,
      url: ai.url,
      error: ai.error || null,
      uptime_seconds: body.uptime_seconds ?? null,
      concurrency,
      throughput,
      models,
      routes: body.routes || [],
    },
    gateway: getAiGatewayStats(),
    capacity,
    activity: {
      sessions_last_hour: recent.rows[0]?.sessions_1h || 0,
      live_sessions: recent.rows[0]?.live_now || 0,
      violation_flags_last_hour: String(recent.rows[0]?.flags_1h || 0),
    },
  };
}

export { setSoftConcurrencyLimit };
