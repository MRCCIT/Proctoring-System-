import crypto from 'crypto';

const PREFIX = 'psk_live_';

export function generateApiKey() {
  return PREFIX + crypto.randomBytes(32).toString('base64url');
}

export function hashApiKey(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}
