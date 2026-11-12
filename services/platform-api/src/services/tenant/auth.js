import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database.js';
import { signTenantAdminToken } from '../../utils/jwt.js';
import { config } from '../../config/index.js';
import { sendTenantAuthEmail } from './authEmail.js';

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

function newRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function sessionPayload(user) {
  const access_token = signTenantAdminToken({
    sub: user.id,
    email: user.email,
    tenant_id: user.tenant_id,
  });
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: process.env.JWT_EXPIRES_IN || '8h',
    tenant: { id: user.tenant_id, slug: user.slug },
    user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role },
  };
}

export function inviteUrlForToken(rawToken) {
  return `${config.tenantAdminPortalUrl}/set-password?token=${encodeURIComponent(rawToken)}`;
}

export function resetUrlForToken(rawToken) {
  return `${config.tenantAdminPortalUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/** Invalidate unused tokens of a purpose, then issue a fresh one. */
export async function issueAuthToken({ tenantId, userId, purpose }) {
  const ttlHours = purpose === 'invite' ? config.inviteTokenTtlHours : config.resetTokenTtlHours;
  const raw = newRawToken();
  const digest = hashToken(raw);
  await query(
    `UPDATE tenant_auth_tokens
        SET used_at = COALESCE(used_at, now())
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
  const { rows } = await query(
    `INSERT INTO tenant_auth_tokens (tenant_id, user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5::text || ' hours')::interval)
     RETURNING id, expires_at`,
    [tenantId, userId, purpose, digest, String(ttlHours)]
  );
  return {
    token: raw,
    expires_at: rows[0].expires_at,
    url: purpose === 'invite' ? inviteUrlForToken(raw) : resetUrlForToken(raw),
  };
}

async function loadValidToken(rawToken, purpose) {
  const digest = hashToken(rawToken);
  const { rows } = await query(
    `SELECT tat.id AS token_id, tat.expires_at, tat.used_at, tat.purpose,
            tu.id, tu.tenant_id, tu.email, tu.display_name, tu.role, tu.password_hash,
            tu.status AS user_status,
            t.slug, t.status AS tenant_status, t.name AS tenant_name
       FROM tenant_auth_tokens tat
       JOIN tenant_users tu ON tu.id = tat.user_id
       JOIN tenants t ON t.id = tat.tenant_id
      WHERE tat.token_hash = $1 AND tat.purpose = $2
      LIMIT 1`,
    [digest, purpose]
  );
  const row = rows[0];
  if (!row) throw fail(404, 'Invalid or expired link.');
  if (row.used_at) throw fail(410, 'This link has already been used.');
  if (new Date(row.expires_at).getTime() < Date.now()) throw fail(410, 'This link has expired.');
  if (row.tenant_status === 'suspended') throw fail(403, 'Organization is suspended.');
  return row;
}

export async function peekAuthToken(rawToken, purpose) {
  const row = await loadValidToken(String(rawToken || ''), purpose);
  return {
    email: row.email,
    display_name: row.display_name,
    tenant_slug: row.slug,
    tenant_name: row.tenant_name,
    purpose: row.purpose,
    expires_at: row.expires_at,
    status: row.user_status,
  };
}

export async function createPendingAdmin(tenantId, { email, display_name, role = 'admin' }) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    throw fail(422, 'A valid admin_email is required');
  }
  const name = display_name ? String(display_name).trim() : null;
  try {
    const { rows } = await query(
      `INSERT INTO tenant_users
         (tenant_id, email, password_hash, display_name, role, permissions, status, invited_at)
       VALUES ($1, $2, NULL, $3, $4, '{}'::jsonb, 'pending', now())
       RETURNING id, email, display_name, role, status, invited_at, created_at`,
      [tenantId, em, name, role]
    );
    const admin = rows[0];
    const invite = await issueAuthToken({ tenantId, userId: admin.id, purpose: 'invite' });
    await sendTenantAuthEmail({
      to: em,
      subject: 'Set up your ProctorShield organization admin account',
      body: `Accept your invite and create a password: ${invite.url}`,
      url: invite.url,
    });
    return { admin, invite_url: invite.url, invite_expires_at: invite.expires_at };
  } catch (err) {
    if (err.code === '23505') throw fail(409, 'A user with this email already exists in this tenant');
    throw err;
  }
}

export async function loginTenantAdmin({ tenant_slug, email, password }) {
  const slug = String(tenant_slug || '').trim().toLowerCase();
  const em = String(email || '').trim().toLowerCase();
  if (!slug || !em || !password) {
    throw fail(422, 'tenant_slug, email, and password are required');
  }
  const { rows } = await query(
    `SELECT tu.id, tu.tenant_id, tu.email, tu.password_hash, tu.display_name, tu.role,
            tu.status AS user_status, t.slug, t.status AS tenant_status
       FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
      WHERE t.slug = $1 AND lower(tu.email) = $2`,
    [slug, em]
  );
  const user = rows[0];
  if (!user || user.tenant_status !== 'active') {
    throw fail(401, 'Invalid credentials');
  }
  if (user.user_status === 'pending' || !user.password_hash) {
    throw fail(403, 'Accept your invite and create a password before signing in.');
  }
  if (user.user_status !== 'active') {
    throw fail(401, 'Invalid credentials');
  }
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) throw fail(401, 'Invalid credentials');
  return sessionPayload(user);
}

export async function acceptInvite({ token, password, display_name }) {
  const raw = String(token || '');
  const pwd = String(password || '');
  if (!raw || !pwd) throw fail(422, 'token and password are required');
  if (pwd.length < 8) throw fail(422, 'password must be at least 8 characters');

  const row = await loadValidToken(raw, 'invite');
  if (row.user_status === 'active' && row.password_hash) {
    throw fail(409, 'This invite was already accepted. Sign in instead.');
  }

  const passwordHash = await bcrypt.hash(pwd, 12);
  const name =
    display_name !== undefined && display_name !== null
      ? String(display_name).trim() || null
      : row.display_name;

  const { rows } = await query(
    `UPDATE tenant_users
        SET password_hash = $1,
            display_name = COALESCE($2, display_name),
            status = 'active',
            activated_at = COALESCE(activated_at, now()),
            updated_at = now()
      WHERE id = $3
      RETURNING id, tenant_id, email, display_name, role`,
    [passwordHash, name, row.id]
  );
  await query(`UPDATE tenant_auth_tokens SET used_at = now() WHERE id = $1`, [row.token_id]);

  const user = { ...rows[0], slug: row.slug };
  return sessionPayload(user);
}

export async function forgotPassword({ tenant_slug, email }) {
  const slug = String(tenant_slug || '').trim().toLowerCase();
  const em = String(email || '').trim().toLowerCase();
  if (!slug || !em) throw fail(422, 'tenant_slug and email are required');

  const generic = {
    ok: true,
    message: 'If an account exists for that organization and email, password reset instructions were issued.',
  };

  const { rows } = await query(
    `SELECT tu.id, tu.tenant_id, tu.email, tu.status AS user_status, tu.password_hash,
            t.slug, t.status AS tenant_status
       FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
      WHERE t.slug = $1 AND lower(tu.email) = $2`,
    [slug, em]
  );
  const user = rows[0];
  if (!user || user.tenant_status !== 'active') return generic;
  if (user.user_status === 'pending' || !user.password_hash) {
    // Still pending invite — re-issue invite instead of reset
    const invite = await issueAuthToken({ tenantId: user.tenant_id, userId: user.id, purpose: 'invite' });
    await sendTenantAuthEmail({
      to: user.email,
      subject: 'Finish setting up your ProctorShield account',
      body: `Create your password: ${invite.url}`,
      url: invite.url,
    });
    if (config.nodeEnv !== 'production') {
      return { ...generic, invite_url: invite.url };
    }
    return generic;
  }

  const reset = await issueAuthToken({ tenantId: user.tenant_id, userId: user.id, purpose: 'reset' });
  await sendTenantAuthEmail({
    to: user.email,
    subject: 'Reset your ProctorShield password',
    body: `Reset your password: ${reset.url}`,
    url: reset.url,
  });
  if (config.nodeEnv !== 'production') {
    return { ...generic, reset_url: reset.url };
  }
  return generic;
}

export async function resetPassword({ token, password }) {
  const raw = String(token || '');
  const pwd = String(password || '');
  if (!raw || !pwd) throw fail(422, 'token and password are required');
  if (pwd.length < 8) throw fail(422, 'password must be at least 8 characters');

  const row = await loadValidToken(raw, 'reset');
  const passwordHash = await bcrypt.hash(pwd, 12);
  const { rows } = await query(
    `UPDATE tenant_users
        SET password_hash = $1,
            status = 'active',
            activated_at = COALESCE(activated_at, now()),
            updated_at = now()
      WHERE id = $2
      RETURNING id, tenant_id, email, display_name, role`,
    [passwordHash, row.id]
  );
  await query(`UPDATE tenant_auth_tokens SET used_at = now() WHERE id = $1`, [row.token_id]);
  return sessionPayload({ ...rows[0], slug: row.slug });
}

export async function issueInviteLinkForUser(tenantId, userId) {
  const { rows } = await query(
    `SELECT id, email, status FROM tenant_users WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  const user = rows[0];
  if (!user) throw fail(404, 'Tenant user not found');
  if (user.status !== 'pending') {
    throw fail(422, 'User is already active. Use a password reset link instead.');
  }
  await query(`UPDATE tenant_users SET invited_at = now(), updated_at = now() WHERE id = $1`, [userId]);
  const invite = await issueAuthToken({ tenantId, userId, purpose: 'invite' });
  await sendTenantAuthEmail({
    to: user.email,
    subject: 'Set up your ProctorShield organization admin account',
    body: `Accept your invite and create a password: ${invite.url}`,
    url: invite.url,
  });
  return { invite_url: invite.url, expires_at: invite.expires_at, email: user.email };
}

export async function issueResetLinkForUser(tenantId, userId) {
  const { rows } = await query(
    `SELECT id, email, status, password_hash FROM tenant_users WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  const user = rows[0];
  if (!user) throw fail(404, 'Tenant user not found');
  if (user.status === 'pending' || !user.password_hash) {
    return issueInviteLinkForUser(tenantId, userId).then((r) => ({
      reset_url: r.invite_url,
      invite_url: r.invite_url,
      expires_at: r.expires_at,
      email: r.email,
      kind: 'invite',
    }));
  }
  const reset = await issueAuthToken({ tenantId, userId, purpose: 'reset' });
  await sendTenantAuthEmail({
    to: user.email,
    subject: 'Reset your ProctorShield password',
    body: `Reset your password: ${reset.url}`,
    url: reset.url,
  });
  return { reset_url: reset.url, expires_at: reset.expires_at, email: user.email, kind: 'reset' };
}
