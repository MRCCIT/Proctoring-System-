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

export function signTenantAdminToken(payload, options = {}) {
  // role = DB role (admin|sub_admin|proctor|viewer). Legacy tokens may still say tenant_admin.
  const body = {
    sub: payload.sub,
    email: payload.email,
    tenant_id: payload.tenant_id,
    role: payload.role || 'admin',
    permissions: payload.permissions || undefined,
  };
  if (payload.impersonation) {
    body.impersonation = true;
    body.impersonated_by = payload.impersonated_by || undefined;
    body.impersonator_email = payload.impersonator_email || undefined;
    body.display_name = payload.display_name || undefined;
    body.tenant_slug = payload.tenant_slug || undefined;
    body.tenant_name = payload.tenant_name || undefined;
  }
  return jwt.sign(body, config.jwtSecret, {
    expiresIn: options.expiresIn || config.jwtExpiresIn,
  });
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

export function signSdkSessionToken(payload, expiresInSeconds = 86400) {
  return jwt.sign(
    { typ: 'sdk_session', tid: payload.tid, sid: payload.sid },
    config.jwtSecret,
    { expiresIn: expiresInSeconds }
  );
}

export function verifySdkSessionToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded.typ !== 'sdk_session' || !decoded.tid || !decoded.sid) {
    const e = new Error('Invalid session token');
    e.status = 401;
    throw e;
  }
  return decoded;
}

export function signLaunchToken(payload, expiresInSeconds = 3600) {
  return jwt.sign(
    { typ: 'launch', tid: payload.tid, sid: payload.sid },
    config.jwtSecret,
    { expiresIn: expiresInSeconds }
  );
}

export function verifyLaunchToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded.typ !== 'launch' || !decoded.tid || !decoded.sid) {
    const e = new Error('Invalid launch token');
    e.status = 401;
    throw e;
  }
  return decoded;
}

export function signAccessLinkToken(payload, expiresInSeconds = 86400) {
  return jwt.sign(
    { typ: 'access_link', tid: payload.tid, lid: payload.lid },
    config.jwtSecret,
    { expiresIn: expiresInSeconds }
  );
}

export function verifyAccessLinkToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded.typ !== 'access_link' || !decoded.tid || !decoded.lid) {
    const e = new Error('Invalid access link token');
    e.status = 401;
    throw e;
  }
  return decoded;
}
