import { createUploadPresign, recordingKey, isObjectStorage } from '../../storage/index.js';
import { config } from '../../config/index.js';
import { assertSessionForTenant } from '../sdk/candidateSessions.js';
import { insertRecordingChunk } from '../tenant/recording.js';
import { query } from '../../config/database.js';

const TRACKS = new Set(['camera', 'screen', 'audio', 'composite']);

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

async function assertStorageQuota(tenantId) {
  const { rows } = await query(
    `SELECT t.quotas,
            (SELECT COALESCE(SUM(s.storage_bytes),0)::bigint FROM exam_sessions s WHERE s.tenant_id = t.id) AS used
       FROM tenants t WHERE t.id = $1`,
    [tenantId]
  );
  const storageMb = Number(rows[0]?.quotas?.storage_mb || 0);
  if (!storageMb) return;
  const used = Number(rows[0]?.used || 0);
  const limit = storageMb * 1024 * 1024;
  if (used >= limit) {
    fail(429, `Tenant storage quota exceeded (${storageMb} MB).`);
  }
}

export async function presignMediaChunk(tenantId, sessionId, body) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) fail(404, 'Session not found');
  await assertStorageQuota(tenantId);

  const track = TRACKS.has(body?.track) ? body.track : 'camera';
  const index = Number.isFinite(Number(body?.index)) ? Number(body.index) : 0;
  const mimeType = body?.mime_type || body?.mime || 'video/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const object_key = recordingKey(tenantId, sessionId, track, index, ext);

  const presign = await createUploadPresign(object_key, mimeType);
  const base = config.publicApiBaseUrl.replace(/\/$/, '');

  if (presign.use_api_base64 || !presign.upload_url) {
    return {
      upload_url: `${base}/v1/sdk/sessions/${sessionId}/media/upload?track=${encodeURIComponent(track)}&index=${index}&mime_type=${encodeURIComponent(mimeType)}&object_key=${encodeURIComponent(object_key)}`,
      object_key,
      headers: { 'Content-Type': mimeType },
      complete_path: `/v1/sdk/sessions/${sessionId}/media/chunk-complete`,
      expires_in: 900,
      storage: presign.storage || 'local',
    };
  }

  return {
    upload_url: presign.upload_url,
    object_key: presign.object_key || object_key,
    headers: presign.headers || { 'Content-Type': mimeType },
    complete_path: `/v1/sdk/sessions/${sessionId}/media/chunk-complete`,
    expires_in: presign.expires_in || 900,
    storage: 's3',
  };
}

export async function completeMediaChunk(tenantId, sessionId, body) {
  const track = TRACKS.has(body?.track) ? body.track : 'camera';
  const index = Number.isFinite(Number(body?.index)) ? Number(body.index) : 0;
  const object_key = body?.object_key;
  if (!object_key) fail(422, 'object_key is required');
  return insertRecordingChunk(tenantId, sessionId, {
    track,
    sequence: index,
    object_key,
    mime_type: body?.mime_type || 'video/webm',
    metadata: { idempotency_key: body?.idempotency_key, upload: isObjectStorage() ? 's3' : 'local' },
    bytes: body?.bytes || null,
  });
}
