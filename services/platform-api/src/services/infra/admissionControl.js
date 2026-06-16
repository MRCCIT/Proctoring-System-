import { query } from '../../config/database.js';
import { getRedis, isRedisEnabled } from '../../config/redis.js';

const memoryCounts = new Map();

async function getTenantQuotas(tenantId) {
  const { rows } = await query(`SELECT quotas FROM tenants WHERE id = $1`, [tenantId]);
  const quotas = rows[0]?.quotas || {};
  const max = parseInt(quotas.max_concurrent_sessions, 10);
  return {
    max_concurrent_sessions: Number.isFinite(max) && max > 0 ? max : 100,
  };
}

async function countActiveSessionsDb(tenantId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM exam_sessions
      WHERE tenant_id = $1 AND status IN ('scheduled', 'active', 'paused')`,
    [tenantId]
  );
  return rows[0]?.n ?? 0;
}

async function getActiveCount(tenantId) {
  if (isRedisEnabled()) {
    const redis = await getRedis();
    const v = await redis.get(`tenant:${tenantId}:active_sessions`);
    if (v != null) return parseInt(v, 10) || 0;
    const dbCount = await countActiveSessionsDb(tenantId);
    await redis.set(`tenant:${tenantId}:active_sessions`, String(dbCount), 'EX', 60);
    return dbCount;
  }
  if (!memoryCounts.has(tenantId)) {
    memoryCounts.set(tenantId, await countActiveSessionsDb(tenantId));
  }
  return memoryCounts.get(tenantId);
}

export async function assertSessionAdmission(tenantId) {
  const quotas = await getTenantQuotas(tenantId);
  const active = await getActiveCount(tenantId);
  if (active >= quotas.max_concurrent_sessions) {
    const e = new Error(
      `Tenant concurrent session limit reached (${quotas.max_concurrent_sessions}). Retry in a few minutes.`
    );
    e.status = 429;
    e.retryAfter = 60;
    throw e;
  }
}

export async function onSessionStarted(tenantId) {
  if (isRedisEnabled()) {
    const redis = await getRedis();
    await redis.incr(`tenant:${tenantId}:active_sessions`);
    await redis.expire(`tenant:${tenantId}:active_sessions`, 3600);
    return;
  }
  const n = (memoryCounts.get(tenantId) || 0) + 1;
  memoryCounts.set(tenantId, n);
}

export async function onSessionEnded(tenantId) {
  if (isRedisEnabled()) {
    const redis = await getRedis();
    const v = await redis.decr(`tenant:${tenantId}:active_sessions`);
    if (v < 0) await redis.set(`tenant:${tenantId}:active_sessions`, '0', 'EX', 3600);
    return;
  }
  const n = Math.max(0, (memoryCounts.get(tenantId) || 0) - 1);
  memoryCounts.set(tenantId, n);
}
