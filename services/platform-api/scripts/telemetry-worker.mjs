/**
 * BullMQ worker: batch telemetry writes (face checks, unified tick persistence).
 *   npm run worker:telemetry -w @proctorshield/platform-api
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(root, '.env') });

const { Worker } = await import('bullmq');
const { default: Redis } = await import('ioredis');
const { processTelemetryJob } = await import('../src/services/telemetry/telemetryBatch.js');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('[telemetry-worker] REDIS_URL is required');
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const concurrency = parseInt(process.env.TELEMETRY_WORKER_CONCURRENCY || '8', 10);

const worker = new Worker(
  'proctorshield:telemetry',
  async (job) => processTelemetryJob(job),
  { connection, concurrency }
);

worker.on('failed', (job, err) => {
  console.error(`[telemetry-worker] failed job ${job?.id}:`, err.message);
});

console.log(`[telemetry-worker] listening (concurrency=${concurrency})`);

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
