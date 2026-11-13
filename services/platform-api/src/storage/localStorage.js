import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');

export const STORAGE_DIR = path.resolve(
  process.env.STORAGE_DIR || path.join(repoRoot, 'storage')
);

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

ensureDir(STORAGE_DIR);
ensureDir(path.join(STORAGE_DIR, 'recordings'));
ensureDir(path.join(STORAGE_DIR, 'snapshots'));
ensureDir(path.join(STORAGE_DIR, 'exports'));
ensureDir(path.join(STORAGE_DIR, 'identity', 'references'));

/** Returns the absolute path for a given storage-relative key. */
export function abs(relKey) {
  const safe = String(relKey || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const full = path.resolve(STORAGE_DIR, safe);
  if (!full.startsWith(STORAGE_DIR)) throw new Error('Path traversal blocked');
  return full;
}

/** Strips an optional `data:...;base64,` prefix. */
export function stripDataUrl(b64OrDataUrl) {
  if (!b64OrDataUrl || typeof b64OrDataUrl !== 'string') return null;
  const i = b64OrDataUrl.indexOf(',');
  return b64OrDataUrl.startsWith('data:') && i > 0 ? b64OrDataUrl.slice(i + 1) : b64OrDataUrl;
}

export function writeBase64(relKey, b64OrDataUrl) {
  const b64 = stripDataUrl(b64OrDataUrl);
  if (!b64) throw new Error('Empty base64 payload');
  const target = abs(relKey);
  ensureDir(path.dirname(target));
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(target, buf);
  return { path: target, key: relKey, bytes: buf.length };
}

export function writeBuffer(relKey, buf) {
  const target = abs(relKey);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, buf);
  return { path: target, key: relKey, bytes: buf.length };
}

export function readFileSafe(relKey) {
  const target = abs(relKey);
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target);
}

export function fileExists(relKey) {
  try {
    return fs.existsSync(abs(relKey));
  } catch {
    return false;
  }
}

export function statSafe(relKey) {
  try {
    return fs.statSync(abs(relKey));
  } catch {
    return null;
  }
}

export function recordingKey(tenantId, sessionId, track, sequence, ext = 'webm') {
  return `recordings/${tenantId}/${sessionId}/${track}-${String(sequence).padStart(6, '0')}.${ext}`;
}

/** Full-session recording after merging timeslice chunks (includes candidate slug). */
export function mergedRecordingKey(tenantId, sessionId, candidateSlug, track, ext = 'webm') {
  const safe = String(candidateSlug || 'candidate')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 64);
  return `recordings/${tenantId}/${sessionId}/merged/${safe}-${track}.${ext}`;
}

export function snapshotKey(tenantId, sessionId, label = 'evidence') {
  const safe = String(label).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 32) || 'evidence';
  return `snapshots/${tenantId}/${sessionId}/${Date.now()}-${safe}.jpg`;
}

export function identityReferenceKey(candidateId, ext = 'jpg') {
  return `identity/references/${candidateId}.${ext}`;
}
