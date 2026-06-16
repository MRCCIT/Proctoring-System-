/**
 * BullMQ worker: processes async AI monitor-tick jobs.
 *   npm run worker:ai -w @proctorshield/platform-api
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(root, '.env') });

const { Worker } = await import('bullmq');
const { default: Redis } = await import('ioredis');
const { processAiJob } = await import('../src/services/ai/unifiedProctorAnalyze.js');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('[ai-worker] REDIS_URL is required');
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const concurrency = parseInt(process.env.AI_WORKER_CONCURRENCY || '4', 10);

const worker = new Worker(
  'proctorshield:ai-jobs',
  async (job) => processAiJob(job),
  { connection, concurrency }
);

worker.on('completed', (job) => {
  console.log(`[ai-worker] completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`[ai-worker] failed job ${job?.id}:`, err.message);
});

console.log(`[ai-worker] listening (concurrency=${concurrency})`);

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
