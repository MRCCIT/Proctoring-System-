import { config } from './index.js';

/** @type {import('ioredis').default | null} */
let client = null;
/** @type {import('ioredis').default | null} */
let subscriber = null;

export function isRedisEnabled() {
  return Boolean(config.redisUrl);
}

export async function getRedis() {
  if (!isRedisEnabled()) return null;
  if (!client) {
    const { default: Redis } = await import('ioredis');
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', (err) => {
      console.error('[redis]', err.message);
    });
  }
  return client;
}

/** Dedicated connection for SUBSCRIBE (cannot share with publish on same conn in cluster). */
export async function getRedisSubscriber() {
  if (!isRedisEnabled()) return null;
  if (!subscriber) {
    const { default: Redis } = await import('ioredis');
    subscriber = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    subscriber.on('error', (err) => {
      console.error('[redis-sub]', err.message);
    });
  }
  return subscriber;
}

export async function redisPing() {
  const r = await getRedis();
  if (!r) return false;
  try {
    return (await r.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis() {
  const closes = [];
  if (client) closes.push(client.quit().catch(() => {}));
  if (subscriber) closes.push(subscriber.quit().catch(() => {}));
  await Promise.all(closes);
  client = null;
  subscriber = null;
}
