import bcrypt from 'bcryptjs';
import { query } from '../../config/database.js';

const ALLOWED_ROLES = new Set(['admin', 'sub_admin', 'proctor', 'viewer']);
const DEFAULT_PERMISSIONS = {
  admin: {
    sessions: ['view', 'pause', 'extend', 'terminate', 'annotate'],
    exams: ['view', 'create', 'edit', 'delete'],
    candidates: ['view', 'import', 'edit'],
    branding: ['view', 'edit'],
    webhooks: ['view', 'create', 'rotate'],
    sdk: ['view', 'rotate_key'],
    users: ['view', 'create', 'edit', 'delete'],
    reports: ['view', 'export'],
    policies: ['view', 'edit'],
  },
  sub_admin: {
    sessions: ['view', 'pause', 'extend', 'terminate'],
    exams: ['view', 'create', 'edit'],
    candidates: ['view', 'import'],
    branding: ['view'],
    webhooks: ['view'],
    sdk: ['view'],
    users: ['view'],
    reports: ['view', 'export'],
    policies: ['view'],
  },
  proctor: {
    sessions: ['view', 'pause', 'extend', 'terminate', 'chat', 'annotate'],
    exams: ['view'],
    candidates: ['view'],
    branding: [],
    webhooks: [],
    sdk: [],
    users: [],
    reports: ['view'],
    policies: ['view'],
  },
  viewer: {
    sessions: ['view'],
    exams: ['view'],
    candidates: ['view'],
    branding: [],
    webhooks: [],
    sdk: [],
    users: [],
    reports: ['view'],
    policies: ['view'],
  },
};

export function defaultPermissions(role) {
  return DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.viewer;
}

export async function listTenantUsers(tenantId) {
  const { rows } = await query(
    `SELECT id, email, display_name, role, permissions, status, invited_at, activated_at, created_at, updated_at,
            max_candidate_capacity, last_active_at
       FROM tenant_users
      WHERE tenant_id = $1
      ORDER BY created_at ASC`,
    [tenantId]
  );
  return rows;
}

export async function createTenantUser(tenantId, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const display_name = body.display_name ? String(body.display_name).trim() : null;
  const role = ALLOWED_ROLES.has(body.role) ? body.role : 'sub_admin';
  const permissions = body.permissions && typeof body.permissions === 'object'
    ? body.permissions
    : defaultPermissions(role);
  if (!email || !password) {
    const e = new Error('email and password are required');
    e.status = 422;
    throw e;
  }
  if (password.length < 8) {
    const e = new Error('password must be at least 8 characters');
    e.status = 422;
    throw e;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query(
      `INSERT INTO tenant_users (tenant_id, email, password_hash, display_name, role, permissions)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, email, display_name, role, permissions, created_at`,
      [tenantId, email, passwordHash, display_name, role, JSON.stringify(permissions)]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('A user with this email already exists in this tenant');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

export async function updateTenantUser(tenantId, userId, body) {
  const sets = [];
  const params = [];
  if (body.display_name !== undefined) {
    params.push(body.display_name ? String(body.display_name).trim() : null);
    sets.push(`display_name = $${params.length}`);
  }
  if (body.role !== undefined && ALLOWED_ROLES.has(body.role)) {
    params.push(body.role);
    sets.push(`role = $${params.length}`);
  }
  if (body.permissions !== undefined && body.permissions && typeof body.permissions === 'object') {
    params.push(JSON.stringify(body.permissions));
    sets.push(`permissions = $${params.length}::jsonb`);
  }
  if (body.password) {
    if (String(body.password).length < 8) {
      const e = new Error('password must be at least 8 characters');
      e.status = 422;
      throw e;
    }
    params.push(await bcrypt.hash(String(body.password), 12));
    sets.push(`password_hash = $${params.length}`);
  }
  if (body.max_candidate_capacity !== undefined) {
    const cap = parseInt(body.max_candidate_capacity, 10);
    if (!Number.isFinite(cap) || cap < 1) {
      const e = new Error('max_candidate_capacity must be a positive integer');
      e.status = 422;
      throw e;
    }
    params.push(cap);
    sets.push(`max_candidate_capacity = $${params.length}`);
  }
  if (body.status !== undefined && ['active', 'disabled', 'pending'].includes(body.status)) {
    params.push(body.status);
    sets.push(`status = $${params.length}`);
  }
  if (!sets.length) {
    const e = new Error('No updates provided');
    e.status = 422;
    throw e;
  }
  params.push(tenantId, userId);
  const sql = `UPDATE tenant_users SET ${sets.join(', ')}, updated_at = now()
               WHERE tenant_id = $${params.length - 1} AND id = $${params.length}
               RETURNING id, email, display_name, role, permissions, status, max_candidate_capacity,
                         last_active_at, created_at, updated_at`;
  const { rows } = await query(sql, params);
  if (!rows.length) {
    const e = new Error('Tenant user not found');
    e.status = 404;
    throw e;
  }
  return rows[0];
}

export async function deleteTenantUser(tenantId, userId) {
  const { rowCount } = await query(
    `DELETE FROM tenant_users WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  return rowCount > 0;
}

/** Invite a proctor (no password) — reuses set-password invite flow. */
export async function inviteProctor(tenantId, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const display_name = body.display_name ? String(body.display_name).trim() : null;
  const capacity = parseInt(body.max_candidate_capacity ?? 20, 10);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const e = new Error('A valid email is required');
    e.status = 422;
    throw e;
  }
  if (!Number.isFinite(capacity) || capacity < 1) {
    const e = new Error('max_candidate_capacity must be a positive integer');
    e.status = 422;
    throw e;
  }
  const permissions = defaultPermissions('proctor');
  try {
    const { rows } = await query(
      `INSERT INTO tenant_users
         (tenant_id, email, password_hash, display_name, role, permissions, status, invited_at, max_candidate_capacity)
       VALUES ($1, $2, NULL, $3, 'proctor', $4::jsonb, 'pending', now(), $5)
       RETURNING id, email, display_name, role, permissions, status, invited_at, max_candidate_capacity, created_at`,
      [tenantId, email, display_name, JSON.stringify(permissions), capacity]
    );
    const user = rows[0];
    const { issueAuthToken } = await import('./auth.js');
    const { sendTenantAuthEmail } = await import('./authEmail.js');
    const invite = await issueAuthToken({ tenantId, userId: user.id, purpose: 'invite' });
    await sendTenantAuthEmail({
      to: email,
      subject: 'Join ProctorShield as a proctor',
      body: `Accept your invite and create a password: ${invite.url}`,
      url: invite.url,
    });
    return { ...user, invite_url: invite.url, invite_expires_at: invite.expires_at };
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('A user with this email already exists in this tenant');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}
