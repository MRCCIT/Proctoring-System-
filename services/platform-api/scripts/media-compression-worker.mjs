#!/usr/bin/env node
/**
 * BullMQ worker for dual-storage recording compression.
 * Falls back to a no-op message when Redis is disabled (API uses in-process jobs).
 *
 * Usage: node scripts/media-compression-worker.mjs
 */
import { isQueueEnabled, getMediaQueue } from '../src/config/queues.js';
import { runCompressJob } from '../src/services/media/compressionJobs.js';
import { detectEncoders, ffmpegAvailable } from '../src/services/tenant/videoCompress.js';
import { getVideoCompressionConfig } from '../src/services/media/videoCompressionConfig.js';

const QUEUE_PREFIX = 'proctorshield';

async function main() {
  const cfg = getVideoCompressionConfig();
  console.log('[media-worker] compression enabled =', cfg.enabled, 'profile =', cfg.profileName);

  if (!(await ffmpegAvailable())) {
    console.error('[media-worker] ffmpeg not found — set FFMPEG_PATH');
    process.exit(1);
  }
  const enc = await detectEncoders();
  console.log('[media-worker] encoders', enc);

  if (!isQueueEnabled()) {
    console.log(
      '[media-worker] Redis/queues disabled — Platform API will run compression in-process via setImmediate. Exiting.'
    );
    process.exit(0);
  }

  const { Worker } = await import('bullmq');
  const { getRedis } = await import('../src/config/redis.js');
  const connection = await getRedis();

  const concurrency = Math.max(1, cfg.maxWorkers || 1);
  const worker = new Worker(
    `${QUEUE_PREFIX}:media-compress`,
    async (job) => {
      console.log('[media-worker] job', job.id, job.name, job.data);
      const result = await runCompressJob(job.data || {});
      console.log('[media-worker] done', job.id, result?.skipped ? result : { ok: true });
      return result;
    },
    {
      connection,
      concurrency,
      lockDuration: Math.min((cfg.timeoutSeconds || 7200) * 1000, 3_600_000),
    }
  );

  worker.on('failed', (job, err) => {
    console.error('[media-worker] failed', job?.id, err?.message || err);
  });

  // Ensure queue exists
  await getMediaQueue();

  console.log('[media-worker] listening on', `${QUEUE_PREFIX}:media-compress`, 'concurrency=', concurrency);

  const shutdown = async () => {
    console.log('[media-worker] shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[media-worker] fatal', e);
  process.exit(1);
});
