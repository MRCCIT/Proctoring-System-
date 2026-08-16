import { config } from '../../config/index.js';
import { getRedis, isRedisEnabled } from '../../config/redis.js';

let memoryLevel = config.aiDegradationLevel;

export async function getAiDegradationLevel() {
  if (isRedisEnabled()) {
    const redis = await getRedis();
    const v = await redis.get('system:ai_degradation_level');
    if (v != null) return parseInt(v, 10) || 0;
  }
  return memoryLevel;
}

export async function setAiDegradationLevel(level) {
  const n = Math.max(0, Math.min(3, parseInt(level, 10) || 0));
  memoryLevel = n;
  if (isRedisEnabled()) {
    const redis = await getRedis();
    await redis.set('system:ai_degradation_level', String(n));
  }
  return n;
}

/**
 * Level 0: full AI
 * Level 1: skip ArcFace identity
 * Level 2: skip phone + electronics + deep gaze
 * Level 3: skip server AI (client-only)
 */
export async function applyDegradationToTickOptions(options = {}) {
  const level = await getAiDegradationLevel();
  if (level >= 3) {
    return { ...options, skipServerAi: true };
  }
  if (level >= 2) {
    return { ...options, run_phone: false, run_electronics: false, run_deep_gaze: false };
  }
  if (level >= 1) {
    return { ...options, run_identity: false };
  }
  return options;
}
