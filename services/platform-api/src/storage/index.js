import { config } from '../config/index.js';
import * as local from './localStorage.js';

export {
  STORAGE_DIR,
  recordingKey,
  mergedRecordingKey,
  snapshotKey,
  identityReferenceKey,
  stripDataUrl,
  abs,
} from './localStorage.js';

export function isObjectStorage() {
  return config.storageBackend === 's3' && Boolean(config.s3AccessKeyId);
}

export async function writeBase64(relKey, b64OrDataUrl) {
  if (!isObjectStorage()) {
    return local.writeBase64(relKey, b64OrDataUrl);
  }
  const b64 = local.stripDataUrl(b64OrDataUrl);
  if (!b64) throw new Error('Empty base64 payload');
  const buf = Buffer.from(b64, 'base64');
  const { s3PutBuffer } = await import('./s3Storage.js');
  await s3PutBuffer(relKey, buf, guessMime(relKey));
  return { path: relKey, key: relKey, bytes: buf.length };
}

export async function writeBuffer(relKey, buf) {
  if (!isObjectStorage()) {
    return local.writeBuffer(relKey, buf);
  }
  const { s3PutBuffer } = await import('./s3Storage.js');
  await s3PutBuffer(relKey, buf, guessMime(relKey));
  return { path: relKey, key: relKey, bytes: buf.length };
}

export async function readFileSafe(relKey) {
  if (!isObjectStorage()) {
    return local.readFileSafe(relKey);
  }
  const { s3ReadBuffer } = await import('./s3Storage.js');
  try {
    return await s3ReadBuffer(relKey);
  } catch {
    return null;
  }
}

export async function fileExists(relKey) {
  if (!isObjectStorage()) {
    return local.fileExists(relKey);
  }
  const { s3Exists } = await import('./s3Storage.js');
  return s3Exists(relKey);
}

export async function statSafe(relKey) {
  if (!isObjectStorage()) {
    return local.statSafe(relKey);
  }
  const { s3Stat } = await import('./s3Storage.js');
  const st = await s3Stat(relKey);
  if (!st) return null;
  return { size: st.size, mtime: st.mtime };
}

export async function createUploadPresign(relKey, contentType) {
  if (!isObjectStorage()) {
    return {
      storage: 'local',
      object_key: relKey,
      upload_url: null,
      use_api_base64: true,
    };
  }
  const { createPresignedPutUrl } = await import('./s3Storage.js');
  const presigned = await createPresignedPutUrl(relKey, contentType);
  return {
    storage: 's3',
    ...presigned,
    use_api_base64: false,
  };
}

function guessMime(key) {
  if (key.endsWith('.webm')) return 'video/webm';
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}
