import crypto from 'crypto';
import { query } from '../../config/database.js';
import {
  readFileSafe,
  writeBuffer,
  recordingVariantKey,
  fileExists,
} from '../../storage/localStorage.js';
import {
  ORIGINAL_SEQUENCE,
  COMPRESSED_SEQUENCE,
  FALLBACK_SEQUENCE,
  MERGED_SEQUENCE,
} from '../media/videoCompressionConfig.js';
import { enqueueCompressJob } from '../media/compressionJobs.js';
import { getVideoCompressionConfig } from '../media/videoCompressionConfig.js';

export { MERGED_SEQUENCE, ORIGINAL_SEQUENCE, COMPRESSED_SEQUENCE, FALLBACK_SEQUENCE };

function sanitizeSlug(label) {
  const s = String(label || 'candidate')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return s || 'candidate';
}

async function getSessionCandidateLabel(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT es.external_ref, c.name AS candidate_name, c.email AS candidate_email
       FROM exam_sessions es
       LEFT JOIN candidates c ON c.id = es.candidate_id AND c.tenant_id = es.tenant_id
      WHERE es.id = $1 AND es.tenant_id = $2`,
    [sessionId, tenantId]
  );
  const row = rows[0];
  if (!row) return 'candidate';
  return row.candidate_name || row.external_ref || row.candidate_email || 'candidate';
}

function parseMeta(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function isVariantRow(row) {
  const variant = row.variant || parseMeta(row.metadata).variant;
  if (variant === 'original' || variant === 'compressed' || variant === 'fallback') return true;
  const meta = parseMeta(row.metadata);
  return meta.merged === true || Number(row.sequence) >= FALLBACK_SEQUENCE;
}

function isSegmentRow(row) {
  if (isVariantRow(row)) return false;
  const variant = row.variant || parseMeta(row.metadata).variant;
  if (variant && variant !== 'segment') return false;
  return Number(row.sequence) < FALLBACK_SEQUENCE;
}

/**
 * Assemble immutable original WebM per track and enqueue async compression.
 * Does not re-encode on the request thread; originals are never deleted.
 */
export async function mergeSessionRecordings(tenantId, sessionId) {
  const candidateLabel = await getSessionCandidateLabel(tenantId, sessionId);
  const slug = sanitizeSlug(candidateLabel);
  const cfg = getVideoCompressionConfig();

  const { rows: chunks } = await query(
    `SELECT id, track, sequence, file_path, bytes, duration_ms, started_at, ended_at, mime_type, metadata, variant
       FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2 AND file_path IS NOT NULL
      ORDER BY track, sequence ASC`,
    [tenantId, sessionId]
  );

  const segmentChunks = chunks.filter(isSegmentRow);
  const byTrack = new Map();
  for (const c of segmentChunks) {
    if (!byTrack.has(c.track)) byTrack.set(c.track, []);
    byTrack.get(c.track).push(c);
  }

  const assembled = [];
  const jobs = [];

  for (const [track, list] of byTrack) {
    if (!list.length) continue;

    const buffers = [];
    let totalDuration = 0;
    let earliest = null;
    let latest = null;
    let mime = 'video/webm';

    for (const c of list) {
      const buf = readFileSafe(c.file_path);
      if (!buf?.length) continue;
      buffers.push(buf);
      totalDuration += c.duration_ms ? Number(c.duration_ms) : 0;
      if (c.started_at && (!earliest || c.started_at < earliest)) earliest = c.started_at;
      if (c.ended_at && (!latest || c.ended_at > latest)) latest = c.ended_at;
      if (c.mime_type) mime = c.mime_type;
    }

    if (!buffers.length) continue;

    const rawMerged = Buffer.concat(buffers);
    const checksum = crypto.createHash('sha256').update(rawMerged).digest('hex');
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const relKey = recordingVariantKey(tenantId, sessionId, slug, track, 'original', ext);
    writeBuffer(relKey, rawMerged);

    const displayName = `${slug}-${track}-original.${ext}`;
    const metadata = {
      merged: true,
      variant: 'original',
      candidate_label: candidateLabel,
      display_name: displayName,
      segment_count: list.length,
      mime,
      immutable: true,
    };

    const { rows } = await query(
      `INSERT INTO session_recording_chunks
         (tenant_id, session_id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at,
          metadata, file_path, mime_type, variant, checksum_sha256, compression_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,'original',$13,'pending')
       ON CONFLICT (session_id, track, sequence) DO UPDATE SET
         object_key = EXCLUDED.object_key,
         duration_ms = EXCLUDED.duration_ms,
         bytes = EXCLUDED.bytes,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         metadata = EXCLUDED.metadata,
         file_path = EXCLUDED.file_path,
         mime_type = EXCLUDED.mime_type,
         variant = 'original',
         checksum_sha256 = EXCLUDED.checksum_sha256,
         compression_status = CASE
           WHEN session_recording_chunks.compression_status = 'completed' THEN session_recording_chunks.compression_status
           ELSE 'pending'
         END
       RETURNING *`,
      [
        tenantId,
        sessionId,
        track,
        ORIGINAL_SEQUENCE,
        relKey,
        totalDuration || null,
        rawMerged.length,
        earliest,
        latest,
        JSON.stringify(metadata),
        relKey,
        mime,
        checksum,
      ]
    );

    assembled.push(rows[0]);

    // Prefer original for session pointer until compressed completes
    if (track === 'camera' && fileExists(relKey)) {
      await query(
        `UPDATE exam_sessions SET recording_object_key = COALESCE(recording_object_key, $1), updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [relKey, sessionId, tenantId]
      );
    }

    if (cfg.enabled) {
      try {
        jobs.push(await enqueueCompressJob({ tenantId, sessionId, track }));
      } catch (e) {
        console.warn('[recordingMerge] compress enqueue failed', track, e.message || e);
      }
    }
  }

  return {
    candidate_label: candidateLabel,
    merged: assembled,
    original: assembled,
    compress_jobs: jobs,
    compressed: false,
  };
}

/**
 * List playback-ready rows: prefer compressed / fallback / original variants.
 * Still triggers assemble if no variants exist yet.
 */
export async function listSessionRecordingsForPlayback(tenantId, sessionId) {
  await mergeSessionRecordings(tenantId, sessionId);
  const { rows } = await query(
    `SELECT id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, metadata, created_at,
            file_path, mime_type, variant, checksum_sha256, compression_status, compression_error,
            compression_profile, width, height, fps
       FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2
      ORDER BY track, sequence ASC`,
    [tenantId, sessionId]
  );

  const variants = rows.filter(isVariantRow);
  if (variants.length) {
    // Prefer one row per track: compressed > fallback > original > legacy merged
    const byTrack = new Map();
    const rank = (r) => {
      const v = r.variant || parseMeta(r.metadata).variant;
      if (v === 'compressed' || Number(r.sequence) === COMPRESSED_SEQUENCE) return 3;
      if (v === 'fallback' || Number(r.sequence) === FALLBACK_SEQUENCE) return 2;
      if (v === 'original' || Number(r.sequence) === ORIGINAL_SEQUENCE) return 1;
      return 0;
    };
    for (const r of variants) {
      const prev = byTrack.get(r.track);
      if (!prev || rank(r) > rank(prev)) byTrack.set(r.track, r);
    }
    return [...byTrack.values()];
  }
  return rows.filter((r) => r.file_path && isSegmentRow(r));
}
