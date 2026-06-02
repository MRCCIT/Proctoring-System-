import crypto from 'crypto';
import { config } from '../../config/index.js';

export function buildTurnCredentials() {
  let urls = String(config.turnUrls || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!urls.length) {
    urls.push('stun:stun.l.google.com:19302');
  }
  const ttl = config.turnCredentialTtlSeconds || 600;
  const username = `${config.turnUsername || 'sdk'}:${Math.floor(Date.now() / 1000) + ttl}`;
  const credential = crypto.createHmac('sha1', config.jwtSecret).update(username).digest('base64');
  const iceServers = urls.map((u) => {
    if (u.startsWith('turn:') || u.startsWith('turns:')) {
      return { urls: u, username, credential };
    }
    return { urls: u };
  });
  return {
    username,
    credential,
    ttl_seconds: ttl,
    ice_servers: iceServers,
    note: 'Replace with your TURN REST API (e.g. coturn use-auth-secret) in production.',
  };
}
