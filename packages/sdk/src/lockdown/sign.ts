/**
 * Policy signing helpers (HMAC-SHA256 over canonical JSON).
 * Browser uses Web Crypto; Node tests / API use crypto.createHmac via injectables.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return value;
}

export function signableDocument(policy: unknown, examId: string, signedAt: string) {
  return { exam_id: examId, signed_at: signedAt, policy };
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.importKey === 'function') {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(message));
    return toHex(sig);
  }
  // Node fallback without importing node:crypto at top-level (keeps browser bundling clean).
  const { createHmac } = await import('crypto');
  return createHmac('sha256', secret).update(message).digest('hex');
}

export async function signPolicy(
  policy: unknown,
  secret: string,
  examId: string,
  signedAt = new Date().toISOString()
): Promise<{ signature: string; signed_at: string; document: ReturnType<typeof signableDocument> }> {
  const document = signableDocument(policy, examId, signedAt);
  const signature = await hmacSha256Hex(secret, canonicalJson(document));
  return { signature, signed_at: signedAt, document };
}

export async function verifyPolicy(
  policy: unknown,
  signature: string,
  secret: string,
  examId: string,
  signedAt: string
): Promise<boolean> {
  const expected = await hmacSha256Hex(secret, canonicalJson(signableDocument(policy, examId, signedAt)));
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return ok === 0;
}
