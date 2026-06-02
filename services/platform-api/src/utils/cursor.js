import crypto from 'crypto';

const CURSOR_SECRET = process.env.CURSOR_HMAC_SECRET || 'cursor-dev-secret';

export function encodeCursor(payload) {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', CURSOR_SECRET).update(json).digest('base64url');
  return Buffer.from(JSON.stringify({ p: payload, s: sig }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const { p, s } = JSON.parse(raw);
    const json = JSON.stringify(p);
    const expected = crypto.createHmac('sha256', CURSOR_SECRET).update(json).digest('base64url');
    if (s !== expected) return null;
    return p;
  } catch {
    return null;
  }
}
