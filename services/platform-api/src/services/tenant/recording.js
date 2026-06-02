import { query } from '../../config/database.js';
import {
  writeBase64,
  recordingKey as buildRecordingKey,
  snapshotKey as buildSnapshotKey,
  stripDataUrl,
} from '../../storage/localStorage.js';

export async function listSessionRecordingChunks(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, metadata, created_at
       FROM session_recording_chunks
      WHERE tenant_id = $1 AND session_id = $2
      ORDER BY track, sequence ASC`,
    [tenantId, sessionId]
  );
  return rows;
}

export async function insertRecordingChunk(tenantId, sessionId, body) {
  const track = ['camera', 'screen', 'audio', 'composite'].includes(body.track) ? body.track : 'camera';
  const sequence = Number.isFinite(parseInt(body.sequence, 10)) ? parseInt(body.sequence, 10) : 0;
  const mimeType = body.mime_type || body.mime || 'video/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('audio') ? 'webm' : 'webm';
  const computedKey = buildRecordingKey(tenantId, sessionId, track, sequence, ext);
  const object_key = body.object_key || computedKey;

  let fileWrite = null;
  if (body.payload_base64) {
    try {
      fileWrite = writeBase64(computedKey, body.payload_base64);
    } catch (e) {
      const err = new Error(`Failed to write recording chunk to disk: ${e.message}`);
      err.status = 500;
      throw err;
    }
  }

  const duration_ms = body.duration_ms ? parseInt(body.duration_ms, 10) : null;
  const bytes = fileWrite?.bytes ?? (body.bytes ? Number(body.bytes) : null);
  const started_at = body.started_at || null;
  const ended_at = body.ended_at || null;
  const metadata = {
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    mime: mimeType,
    persisted: Boolean(fileWrite),
  };
  const { rows } = await query(
    `INSERT INTO session_recording_chunks
       (tenant_id, session_id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, metadata, file_path, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
     ON CONFLICT (session_id, track, sequence) DO UPDATE SET
       object_key = EXCLUDED.object_key,
       duration_ms = COALESCE(EXCLUDED.duration_ms, session_recording_chunks.duration_ms),
       bytes = COALESCE(EXCLUDED.bytes, session_recording_chunks.bytes),
       ended_at = COALESCE(EXCLUDED.ended_at, session_recording_chunks.ended_at),
       metadata = session_recording_chunks.metadata || EXCLUDED.metadata,
       file_path = COALESCE(EXCLUDED.file_path, session_recording_chunks.file_path),
       mime_type = COALESCE(EXCLUDED.mime_type, session_recording_chunks.mime_type)
     RETURNING id, track, sequence, object_key, duration_ms, bytes, started_at, ended_at, file_path, mime_type, created_at`,
    [
      tenantId,
      sessionId,
      track,
      sequence,
      object_key,
      duration_ms,
      bytes,
      started_at,
      ended_at,
      JSON.stringify(metadata),
      fileWrite ? computedKey : null,
      mimeType,
    ]
  );
  if (bytes) {
    await query(
      `UPDATE exam_sessions SET storage_bytes = storage_bytes + $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [bytes, sessionId, tenantId]
    );
  }
  return rows[0];
}

function mapFaceViolationToSessionEvent(v) {
  const key = String(v || '').trim();
  if (key === 'no_face_detected') return { event_type: 'ai.no_face_in_frame', severity: 'warn' };
  if (key === 'multiple_faces_detected') return { event_type: 'ai.multiple_faces', severity: 'flag' };
  if (key === 'identity_mismatch') return { event_type: 'ai.identity_mismatch', severity: 'flag' };
  return { event_type: `ai.${key.replace(/[^a-z0-9_]/gi, '_')}`, severity: 'warn' };
}

export async function insertFaceChecks(tenantId, sessionId, items) {
  if (!Array.isArray(items) || !items.length) {
    const e = new Error('items array is required');
    e.status = 422;
    throw e;
  }
  const inserted = [];
  let eventAdds = 0;
  for (const it of items) {
    const occurred_at = it.occurred_at ? new Date(it.occurred_at) : new Date();
    const fc = Number.isFinite(Number(it.face_count)) ? Number(it.face_count) : parseInt(String(it.face_count), 10) || 0;
    const viols = Array.isArray(it.violations) ? it.violations : [];
    const { rows } = await query(
      `INSERT INTO session_face_checks
        (tenant_id, session_id, face_count, match_score, gaze_direction, gaze_score, sideways_score, detector, violations, occurred_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::timestamptz, $11)
       RETURNING id, occurred_at`,
      [
        tenantId,
        sessionId,
        fc,
        it.match_score != null ? Number(it.match_score) : null,
        it.gaze_direction || null,
        it.gaze_score != null ? Number(it.gaze_score) : null,
        it.sideways_score != null ? Number(it.sideways_score) : null,
        it.detector || 'wasm',
        viols,
        occurred_at.toISOString(),
        it.source || (it.match_score != null ? 'identity_check' : 'local_worker'),
      ]
    );
    inserted.push(rows[0]);

    for (const v of viols) {
      const mapped = mapFaceViolationToSessionEvent(v);
      await query(
        `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
        [
          tenantId,
          sessionId,
          mapped.event_type,
          mapped.severity,
          JSON.stringify({ source: it.source || 'face_check', face_count: fc, detector: it.detector }),
          occurred_at.toISOString(),
        ]
      );
      eventAdds += 1;
    }
    if (viols.length) {
      await query(
        `UPDATE exam_sessions SET violation_flags = violation_flags + $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [viols.length, sessionId, tenantId]
      );
    }
  }
  return { inserted_count: inserted.length, session_events_added: eventAdds };
}

export async function listSessionFaceChecks(tenantId, sessionId, { limit }) {
  const n = Math.min(parseInt(limit, 10) || 200, 1000);
  const { rows } = await query(
    `SELECT id, face_count, match_score, gaze_direction, gaze_score, sideways_score, detector, violations, occurred_at, source
       FROM session_face_checks
      WHERE tenant_id = $1 AND session_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3`,
    [tenantId, sessionId, n]
  );
  return rows.reverse();
}

export async function insertSnapshotEvidence(tenantId, sessionId, body) {
  const caption = body.caption || null;
  const violation_context = body.violation_context && typeof body.violation_context === 'object'
    ? body.violation_context
    : {};
  const source = body.source || (caption ? 'violation' : 'evidence');
  const label = body.label || (violation_context.violation || violation_context.reason || source);
  const mime = body.mime_type || 'image/jpeg';

  let fileWrite = null;
  const computedKey = buildSnapshotKey(tenantId, sessionId, label);
  if (body.image_base64) {
    try {
      fileWrite = writeBase64(computedKey, body.image_base64);
    } catch (_e) {
      /* still insert metadata even if write fails */
    }
  }

  const object_key = body.object_key || computedKey;
  const { rows } = await query(
    `INSERT INTO session_snapshots (tenant_id, session_id, object_key, caption, violation_context, file_path, mime_type, bytes, source)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
     RETURNING id, object_key, caption, captured_at, file_path, mime_type, bytes, source`,
    [
      tenantId,
      sessionId,
      object_key,
      caption,
      JSON.stringify(violation_context),
      fileWrite ? computedKey : null,
      mime,
      fileWrite?.bytes ?? null,
      source,
    ]
  );
  return rows[0];
}

// strip-data-url helper kept here so callers don't have to import storage.
export { stripDataUrl };
