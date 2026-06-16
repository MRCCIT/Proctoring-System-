import { config } from '../../config/index.js';
import { getRedis, getRedisSubscriber, isRedisEnabled } from '../../config/redis.js';

const CHANNEL_PREFIX = 'ws:session:';

/** @type {Map<string, Set<(payload: object) => void>>} */
const localListeners = new Map();

let subscribed = false;

function channelFor(sessionId) {
  return `${CHANNEL_PREFIX}${sessionId}`;
}

export function isWsPubSubEnabled() {
  return isRedisEnabled() && config.wsPubSubEnabled;
}

async function ensureSubscribed() {
  if (!isWsPubSubEnabled() || subscribed) return;
  const sub = await getRedisSubscriber();
  if (!sub) return;
  await sub.psubscribe(`${CHANNEL_PREFIX}*`);
  sub.on('pmessage', (_pattern, channel, message) => {
    const sessionId = channel.slice(CHANNEL_PREFIX.length);
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }
    const set = localListeners.get(sessionId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch {
        /* ignore */
      }
    }
  });
  subscribed = true;
}

export async function publishToSession(sessionId, payload) {
  if (isWsPubSubEnabled()) {
    const redis = await getRedis();
    await redis.publish(channelFor(sessionId), JSON.stringify(payload));
    return;
  }
  const set = localListeners.get(sessionId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  }
}

export async function subscribeSession(sessionId, handler) {
  if (isWsPubSubEnabled()) {
    await ensureSubscribed();
  }
  if (!localListeners.has(sessionId)) localListeners.set(sessionId, new Set());
  localListeners.get(sessionId).add(handler);
  return () => {
    localListeners.get(sessionId)?.delete(handler);
    if (localListeners.get(sessionId)?.size === 0) localListeners.delete(sessionId);
  };
}
