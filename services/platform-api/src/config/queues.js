import { config } from './index.js';
import { isRedisEnabled } from './redis.js';

/** @type {import('bullmq').Queue | null} */
let aiQueue = null;
/** @type {import('bullmq').Queue | null} */
let telemetryQueue = null;
/** @type {import('bullmq').QueueEvents | null} */
let aiQueueEvents = null;

const QUEUE_PREFIX = 'proctorshield';

export function isQueueEnabled() {
  return isRedisEnabled();
}

export async function getAiQueue() {
  if (!isQueueEnabled()) return null;
  if (!aiQueue) {
    const { Queue } = await import('bullmq');
    const { getRedis } = await import('./redis.js');
    const connection = await getRedis();
    aiQueue = new Queue(`${QUEUE_PREFIX}:ai-jobs`, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: { age: 86400, count: 2000 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return aiQueue;
}

export async function getTelemetryQueue() {
  if (!isQueueEnabled()) return null;
  if (!telemetryQueue) {
    const { Queue } = await import('bullmq');
    const { getRedis } = await import('./redis.js');
    const connection = await getRedis();
    telemetryQueue = new Queue(`${QUEUE_PREFIX}:telemetry`, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 10000 },
        removeOnFail: { age: 86400, count: 5000 },
        attempts: 3,
        backoff: { type: 'fixed', delay: 1000 },
      },
    });
  }
  return telemetryQueue;
}

export async function getAiQueueEvents() {
  if (!isQueueEnabled()) return null;
  if (!aiQueueEvents) {
    const { QueueEvents } = await import('bullmq');
    const { getRedis } = await import('./redis.js');
    const connection = await getRedis();
    aiQueueEvents = new QueueEvents(`${QUEUE_PREFIX}:ai-jobs`, { connection });
  }
  return aiQueueEvents;
}

export function useAsyncAi() {
  return config.aiMode === 'async' && isQueueEnabled();
}

export function useAsyncTelemetry() {
  return config.telemetryMode === 'async' && isQueueEnabled();
}

export async function closeQueues() {
  const closes = [];
  if (aiQueue) closes.push(aiQueue.close());
  if (telemetryQueue) closes.push(telemetryQueue.close());
  if (aiQueueEvents) closes.push(aiQueueEvents.close());
  await Promise.all(closes);
  aiQueue = null;
  telemetryQueue = null;
  aiQueueEvents = null;
}
