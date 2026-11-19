import path from 'path';
import fs from 'fs';
import { query } from '../../config/database.js';
import { abs, ensureDir, fileExists, recordingVariantKey } from '../../storage/localStorage.js';
import {
  COMPRESSED_SEQUENCE,
  FALLBACK_SEQUENCE,
  ORIGINAL_SEQUENCE,
  getVideoCompressionConfig,
} from './videoCompressionConfig.js';
import {
  compressRecordingFile,
  ffmpegAvailable,
  isRecordingCompressEnabled,
} from '../tenant/videoCompress.js';
import { isQueueEnabled } from '../../config/queues.js';
import { shouldSkipCompressJob } from './recordingPlaybackPrefer.js';

const runners = new Set();

function parseMeta(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

async function upsertVariantRow({
  tenantId,
  sessionId,
  track,
  sequence,
  variant,
  relKey,
  bytes,
  mime,
  durationMs,
  startedAt,
  endedAt,
  metadata,
  checksum,
  compressionStatus,
  compressionError,
  compressionProfile,
  width,
  height,
  fps,
}) {
  const { rows } = await query(
    `INSERT INTO session_recording_chunks
       (tenant_id, session_id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at,
        metadata, file_path, mime_type, variant, checksum_sha256, compression_status, compression_error,
        compression_profile, width, height, fps)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (session_id, track, sequence) DO UPDATE SET
       object_key = EXCLUDED.object_key,
       duration_ms = EXCLUDED.duration_ms,
       bytes = EXCLUDED.bytes,
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at,
       metadata = EXCLUDED.metadata,
       file_path = EXCLUDED.file_path,
       mime_type = EXCLUDED.mime_type,
       variant = EXCLUDED.variant,
       checksum_sha256 = EXCLUDED.checksum_sha256,
       compression_status = EXCLUDED.compression_status,
       compression_error = EXCLUDED.compression_error,
       compression_profile = EXCLUDED.compression_profile,
       width = EXCLUDED.width,
       height = EXCLUDED.height,
       fps = EXCLUDED.fps
     RETURNING *`,
    [
      tenantId,
      sessionId,
      track,
      sequence,
      relKey,
      durationMs,
      bytes,
      startedAt,
      endedAt,
      JSON.stringify(metadata || {}),
      relKey,
      mime,
      variant,
      checksum || null,
      compressionStatus || null,
      compressionError || null,
      compressionProfile || null,
      width || null,
      height || null,
      fps || null,
    ]
  );
  return rows[0];
}

async function getOriginalRow(tenantId, sessionId, track) {
  const { rows } = await query(
    `SELECT * FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2 AND track = $3
        AND (variant = 'original' OR sequence = $4)
      ORDER BY sequence DESC LIMIT 1`,
    [tenantId, sessionId, track, ORIGINAL_SEQUENCE]
  );
  return rows[0] || null;
}

export async function runCompressJob({ tenantId, sessionId, track, force = false, h264Only = false }) {
  const key = `${tenantId}:${sessionId}:${track}:${h264Only ? 'fb' : 'c'}`;
  if (runners.has(key)) return { skipped: true, reason: 'already_running' };
  runners.add(key);

  const cfg = getVideoCompressionConfig();
  try {
    if (!isRecordingCompressEnabled()) {
      return { skipped: true, reason: 'disabled' };
    }
    if (!(await ffmpegAvailable())) {
      return { skipped: true, reason: 'ffmpeg_missing' };
    }

    const original = await getOriginalRow(tenantId, sessionId, track);
    if (!original?.file_path || !fileExists(original.file_path)) {
      return { skipped: true, reason: 'original_missing' };
    }

    const meta = parseMeta(original.metadata);
    const slug = meta.candidate_label || 'candidate';

    if (!force) {
      const seq = h264Only ? FALLBACK_SEQUENCE : COMPRESSED_SEQUENCE;
      const variant = h264Only ? 'fallback' : 'compressed';
      const { rows: existing } = await query(
        `SELECT id, compression_status, metadata FROM session_recording_chunks
          WHERE tenant_id = $1 AND session_id = $2 AND track = $3
            AND (variant = $4 OR sequence = $5)
          LIMIT 1`,
        [tenantId, sessionId, track, variant, seq]
      );
      const exMeta = parseMeta(existing[0]?.metadata);
      if (
        shouldSkipCompressJob({
          force,
          existingStatus: existing[0]?.compression_status,
          existingOriginalChecksum: exMeta.original_checksum,
          currentOriginalChecksum: original.checksum_sha256,
        })
      ) {
        return { skipped: true, reason: 'already_completed', id: existing[0].id };
      }
    }

    await query(
      `UPDATE session_recording_chunks
          SET compression_status = 'processing', compression_error = NULL
        WHERE tenant_id = $1 AND session_id = $2 AND track = $3 AND sequence = $4`,
      [tenantId, sessionId, track, ORIGINAL_SEQUENCE]
    ).catch(() => {});

    const variant = h264Only ? 'fallback' : 'compressed';
    const sequence = h264Only ? FALLBACK_SEQUENCE : COMPRESSED_SEQUENCE;
    const extGuess = h264Only ? 'mp4' : 'webm';
    let relKey = recordingVariantKey(tenantId, sessionId, slug, track, variant, extGuess);

    let result;
    try {
      result = await compressRecordingFile(abs(original.file_path), {
        outputRelKey: relKey,
        preferH264: h264Only,
        cfg,
      });
      if (result.ext && result.ext !== extGuess) {
        const finalKey = recordingVariantKey(tenantId, sessionId, slug, track, variant, result.ext);
        if (finalKey !== relKey && fileExists(relKey)) {
          ensureDir(path.dirname(abs(finalKey)));
          fs.renameSync(abs(relKey), abs(finalKey));
          relKey = finalKey;
        } else if (finalKey !== relKey && result.outputRelKey === relKey) {
          // compress wrote to guessed key; if strategy.ext differs, rename when present
          if (fileExists(relKey)) {
            ensureDir(path.dirname(abs(finalKey)));
            fs.renameSync(abs(relKey), abs(finalKey));
            relKey = finalKey;
            result.outputRelKey = finalKey;
          }
        }
      }
    } catch (e) {
      await upsertVariantRow({
        tenantId,
        sessionId,
        track,
        sequence,
        variant,
        relKey,
        bytes: 0,
        mime: h264Only ? 'video/mp4' : 'video/webm',
        durationMs: original.duration_ms,
        startedAt: original.started_at,
        endedAt: original.ended_at,
        metadata: {
          merged: true,
          variant,
          compress_error: String(e.message || e).slice(0, 400),
          candidate_label: slug,
        },
        compressionStatus: 'compression_failed',
        compressionError: String(e.message || e).slice(0, 2000),
        compressionProfile: cfg.profile,
      }).catch(() => {});
      await query(
        `UPDATE session_recording_chunks
            SET compression_status = 'compression_failed', compression_error = $5
          WHERE tenant_id = $1 AND session_id = $2 AND track = $3 AND sequence = $4`,
        [tenantId, sessionId, track, ORIGINAL_SEQUENCE, String(e.message || e).slice(0, 2000)]
      ).catch(() => {});
      throw e;
    }

    const outKey = result.outputRelKey || relKey;
    const row = await upsertVariantRow({
      tenantId,
      sessionId,
      track,
      sequence,
      variant,
      relKey: outKey,
      bytes: result.bytes,
      mime: result.mime_type,
      durationMs: result.duration_seconds != null ? Math.round(result.duration_seconds * 1000) : original.duration_ms,
      startedAt: original.started_at,
      endedAt: original.ended_at,
      metadata: {
        merged: true,
        variant,
        compressed: true,
        codec: result.codec,
        audio_codec: result.audio_codec,
        strategy: result.strategy,
        profile: result.profile,
        crf: result.crf,
        display_name: `${String(slug).replace(/[^a-zA-Z0-9._-]+/g, '_')}-${track}.${result.ext}`,
        original_bytes: original.bytes != null ? Number(original.bytes) : null,
        original_checksum: original.checksum_sha256 || null,
        ratio:
          original.bytes && result.bytes
            ? Number((Number(result.bytes) / Number(original.bytes)).toFixed(3))
            : null,
        candidate_label: slug,
      },
      checksum: result.checksum_sha256,
      compressionStatus: 'completed',
      compressionProfile: cfg.profile,
      width: result.width,
      height: result.height,
      fps: result.fps,
    });

    await query(
      `UPDATE session_recording_chunks
          SET compression_status = 'completed', compression_error = NULL, compression_profile = $5
        WHERE tenant_id = $1 AND session_id = $2 AND track = $3 AND sequence = $4`,
      [tenantId, sessionId, track, ORIGINAL_SEQUENCE, cfg.profile]
    ).catch(() => {});

    if (track === 'camera' && outKey) {
      await query(
        `UPDATE exam_sessions SET recording_object_key = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [outKey, sessionId, tenantId]
      ).catch(() => {});
    }

    if (!h264Only && cfg.generateH264Fallback && result.strategy !== 'h264') {
      setImmediate(() => {
        void enqueueCompressJob({ tenantId, sessionId, track, h264Only: true }).catch((err) =>
          console.warn('[compression] h264 fallback enqueue failed', err.message || err)
        );
      });
    }

    try {
      const { emitMetric } = await import('../observability/aggregator.js');
      emitMetric({
        tenant_id: tenantId,
        service_name: 'media',
        metric_name: 'compress_done',
        metric_value: 1,
        operation_name: h264Only ? 'h264_fallback' : 'compress',
        workload_type: track,
      });
      if (original.bytes && result.bytes) {
        emitMetric({
          tenant_id: tenantId,
          service_name: 'media',
          metric_name: 'compress_ratio',
          metric_value: Number(result.bytes) / Number(original.bytes),
          metric_unit: 'ratio',
          operation_name: 'compress',
          workload_type: track,
        });
        emitMetric({
          tenant_id: tenantId,
          service_name: 'media',
          metric_name: 'original_bytes',
          metric_value: Number(original.bytes),
          metric_unit: 'bytes',
          operation_name: 'compress',
        });
        emitMetric({
          tenant_id: tenantId,
          service_name: 'media',
          metric_name: 'compressed_bytes',
          metric_value: Number(result.bytes),
          metric_unit: 'bytes',
          operation_name: 'compress',
        });
      }
    } catch {
      /* ignore */
    }

    return { ok: true, row, result };
  } finally {
    runners.delete(key);
  }
}

export async function enqueueCompressJob(job) {
  const payload = {
    tenantId: job.tenantId,
    sessionId: job.sessionId,
    track: job.track,
    force: Boolean(job.force),
    h264Only: Boolean(job.h264Only),
  };

  if (isQueueEnabled()) {
    try {
      const { getMediaQueue } = await import('../../config/queues.js');
      const q = await getMediaQueue();
      if (q) {
        const id = `${payload.sessionId}:${payload.track}:${payload.h264Only ? 'fb' : 'c'}${payload.force ? ':f' : ''}`;
        await q.add('compress-recording', payload, {
          jobId: id,
          removeOnComplete: true,
          attempts: getVideoCompressionConfig().maxRetries + 1,
          backoff: { type: 'exponential', delay: 5000 },
        });
        return { queued: true, via: 'bullmq', jobId: id };
      }
    } catch (e) {
      console.warn('[compression] BullMQ unavailable, using in-process:', e.message || e);
    }
  }

  try {
    const { emitMetric } = await import('../observability/aggregator.js');
    emitMetric({
      tenant_id: payload.tenantId,
      service_name: 'media',
      metric_name: 'compress_queued',
      metric_value: 1,
      operation_name: 'enqueue',
      workload_type: payload.track,
    });
  } catch {
    /* ignore */
  }

  setImmediate(() => {
    void runCompressJob(payload).catch((err) => {
      console.error('[compression] in-process job failed', payload.sessionId, payload.track, err.message || err);
      import('../observability/aggregator.js')
        .then(({ emitMetric }) =>
          emitMetric({
            tenant_id: payload.tenantId,
            service_name: 'media',
            metric_name: 'compress_failed',
            metric_value: 1,
            status: 'error',
            operation_name: 'compress',
            workload_type: payload.track,
          })
        )
        .catch(() => {});
    });
  });
  return { queued: true, via: 'in_process' };
}

export async function enqueueCompressForSession(tenantId, sessionId, { force = false } = {}) {
  const { rows } = await query(
    `SELECT DISTINCT track FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2
        AND (variant = 'original' OR sequence = $3)`,
    [tenantId, sessionId, ORIGINAL_SEQUENCE]
  );
  const tracks = rows.map((r) => r.track);
  const out = [];
  for (const track of tracks) {
    out.push(await enqueueCompressJob({ tenantId, sessionId, track, force }));
  }
  return { tracks, jobs: out };
}
