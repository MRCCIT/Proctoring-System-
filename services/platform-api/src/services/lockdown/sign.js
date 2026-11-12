import { createHmac, timingSafeEqual } from 'crypto';

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

export function signableDocument(policy, examId, signedAt) {
  return { exam_id: examId, signed_at: signedAt, policy };
}

export function signPolicy(policy, secret, examId, signedAt = new Date().toISOString()) {
  const document = signableDocument(policy, examId, signedAt);
  const signature = createHmac('sha256', secret).update(canonicalJson(document)).digest('hex');
  return { signature, signed_at: signedAt, document };
}

export function verifyPolicy(policy, signature, secret, examId, signedAt) {
  const expected = createHmac('sha256', secret)
    .update(canonicalJson(signableDocument(policy, examId, signedAt)))
    .digest('hex');
  const a = Buffer.from(String(signature || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** HMAC over { session_id, policy_version, events } — optional client batch integrity. */
export function signLockdownBatch(batch, secret) {
  return createHmac('sha256', secret).update(canonicalJson(batch)).digest('hex');
}

export function verifyLockdownBatch(batch, signature, secret) {
  const expected = signLockdownBatch(batch, secret);
  const a = Buffer.from(String(signature || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
