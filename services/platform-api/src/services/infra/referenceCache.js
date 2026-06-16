import { config } from '../../config/index.js';
import { getRedis, isRedisEnabled } from '../../config/redis.js';

const memory = new Map();

function cacheKey(tenantId, sessionId) {
  return `proctor:ref:${tenantId}:${sessionId}`;
}

export async function getCachedReference(tenantId, sessionId) {
  const k = cacheKey(tenantId, sessionId);
  if (isRedisEnabled()) {
    const redis = await getRedis();
    const v = await redis.get(k);
    if (v === '__null__') return null;
    return v || undefined;
  }
  if (memory.has(k)) return memory.get(k);
  return undefined;
}

export async function setCachedReference(tenantId, sessionId, dataUrl) {
  const k = cacheKey(tenantId, sessionId);
  if (isRedisEnabled()) {
    const redis = await getRedis();
    if (dataUrl == null) {
      await redis.set(k, '__null__', 'EX', config.proctorStateTtlSeconds);
    } else {
      await redis.set(k, dataUrl, 'EX', config.proctorStateTtlSeconds);
    }
    return;
  }
  memory.set(k, dataUrl);
}

export async function clearReferenceCache(sessionId) {
  if (isRedisEnabled()) {
    const redis = await getRedis();
    const keys = await redis.keys(`proctor:ref:*:${sessionId}`);
    if (keys.length) await redis.del(...keys);
    return;
  }
  for (const k of memory.keys()) {
    if (k.endsWith(`:${sessionId}`)) memory.delete(k);
  }
}
