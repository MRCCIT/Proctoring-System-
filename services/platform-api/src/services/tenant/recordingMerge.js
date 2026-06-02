import { query } from '../../config/database.js';
import {
  readFileSafe,
  writeBuffer,
  mergedRecordingKey,
  fileExists,
} from '../../storage/localStorage.js';

/** Reserved sequence for one merged file per track (camera / screen). */
export const MERGED_SEQUENCE = 999999;

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

function isMergedRow(row) {
  const meta = parseMeta(row.metadata);
  return meta.merged === true || row.sequence >= MERGED_SEQUENCE;
}

/**
 * Concatenate persisted WebM chunk files per track into one playable file.
 * MediaRecorder timeslice fragments are not valid standalone videos; merging fixes playback.
 */
export async function mergeSessionRecordings(tenantId, sessionId) {
  const candidateLabel = await getSessionCandidateLabel(tenantId, sessionId);
  const slug = sanitizeSlug(candidateLabel);

  const { rows: chunks } = await query(
    `SELECT id, track, sequence, file_path, bytes, started_at, ended_at, mime_type, metadata
       FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2 AND file_path IS NOT NULL
      ORDER BY track, sequence ASC`,
    [tenantId, sessionId]
  );

  const segmentChunks = chunks.filter((c) => !isMergedRow(c));
  const byTrack = new Map();
  for (const c of segmentChunks) {
    if (!byTrack.has(c.track)) byTrack.set(c.track, []);
    byTrack.get(c.track).push(c);
  }

  const merged = [];

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

    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const relKey = mergedRecordingKey(tenantId, sessionId, slug, track, ext);
    const mergedBuf = Buffer.concat(buffers);
    writeBuffer(relKey, mergedBuf);

    const displayName = `${slug}-${track}.${ext}`;
    const metadata = {
      merged: true,
      candidate_label: candidateLabel,
      display_name: displayName,
      segment_count: list.length,
      mime,
    };

    const { rows } = await query(
      `INSERT INTO session_recording_chunks
         (tenant_id, session_id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, metadata, file_path, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       ON CONFLICT (session_id, track, sequence) DO UPDATE SET
         object_key = EXCLUDED.object_key,
         duration_ms = EXCLUDED.duration_ms,
         bytes = EXCLUDED.bytes,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         metadata = EXCLUDED.metadata,
         file_path = EXCLUDED.file_path,
         mime_type = EXCLUDED.mime_type
       RETURNING id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, metadata, file_path, mime_type, created_at`,
      [
        tenantId,
        sessionId,
        track,
        MERGED_SEQUENCE,
        relKey,
        totalDuration || null,
        mergedBuf.length,
        earliest,
        latest,
        JSON.stringify(metadata),
        relKey,
        mime,
      ]
    );

    merged.push(rows[0]);

    const primaryKey =
      track === 'camera' ? relKey : null;
    if (primaryKey && fileExists(primaryKey)) {
      await query(
        `UPDATE exam_sessions SET recording_object_key = $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [primaryKey, sessionId, tenantId]
      );
    }
  }

  return { candidate_label: candidateLabel, merged };
}

export async function listSessionRecordingsForPlayback(tenantId, sessionId) {
  await mergeSessionRecordings(tenantId, sessionId);
  const { rows } = await query(
    `SELECT id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, metadata, created_at, file_path, mime_type
       FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2
      ORDER BY track, sequence ASC`,
    [tenantId, sessionId]
  );
  const merged = rows.filter(isMergedRow);
  if (merged.length) return merged;
  return rows.filter((r) => r.file_path);
}
