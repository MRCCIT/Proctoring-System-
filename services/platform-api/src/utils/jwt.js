import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function signSuperAdminToken(payload) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: 'superadmin',
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifySuperAdminToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function signTenantAdminToken(payload) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      tenant_id: payload.tenant_id,
      role: 'tenant_admin',
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyTenantAdminToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function signShortLivedResourceToken(claims, expiresInSeconds) {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: expiresInSeconds });
}

export function verifyResourceToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function signSdkWsToken(payload, expiresInSeconds = 86400) {
  return jwt.sign(
    {
      typ: 'sdk_ws',
      tid: payload.tid,
      sid: payload.sid,
    },
    config.jwtSecret,
    { expiresIn: expiresInSeconds }
  );
}

export function verifySdkWsToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded.typ !== 'sdk_ws' || !decoded.tid || !decoded.sid) {
    const e = new Error('Invalid WS token');
    e.status = 401;
    throw e;
  }
  return decoded;
}
