import crypto from 'crypto';
import { pool, query } from '../../config/database.js';
import { config } from '../../config/index.js';
import { signAccessLinkToken, verifyAccessLinkToken, verifyLaunchToken } from '../../utils/jwt.js';
import {
  findOrCreateCandidate,
  findOrCreateExamContext,
  getIntegrationSession,
  issueCandidateCredentials,
  webhookSessionData,
} from './sessions.js';
import { emitWebhookEvent } from '../webhooks/dispatcher.js';

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function linkUrl(token) {
  return `${config.candidateAppUrl}/?link=${encodeURIComponent(token)}`;
}

function serializeLink(row, tenantId) {
  const ttl = row.expires_at ? Math.max(1, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000)) : null;
  const token = signAccessLinkToken({ tid: tenantId, lid: row.id }, ttl && ttl > 0 ? ttl : undefined);
  return {
    id: row.id,
    label: row.label,
    exam_id: row.exam_id,
    exam_title: row.exam_title || null,
    is_active: row.is_active,
    expires_at: row.expires_at,
    max_uses: row.max_uses,
    use_count: row.use_count,
    created_at: row.created_at,
    url: linkUrl(token),
  };
}

export async function listAccessLinks(tenantId, { exam_id } = {}) {
  const params = [tenantId];
  let where = 'WHERE l.tenant_id = $1';
  if (exam_id) {
    params.push(exam_id);
    where += ` AND l.exam_id = $2::uuid`;
  }
  const { rows } = await query(
    `SELECT l.*, e.title AS exam_title FROM access_links l
     LEFT JOIN exams e ON e.id = l.exam_id
     ${where} ORDER BY l.created_at DESC LIMIT 200`,
    params
  );
  return rows.map((r) => serializeLink(r, tenantId));
}

export async function createAccessLink(tenantId, body, actor) {
  const exam_id = body.exam_id || null;
  if (exam_id) {
    const { rows } = await query(`SELECT id FROM exams WHERE id = $1 AND tenant_id = $2`, [exam_id, tenantId]);
    if (!rows[0]) throw fail(404, 'Exam not found');
  }
  let expires_at = null;
  if (body.expires_in_hours) {
    const h = Number(body.expires_in_hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24 * 365) throw fail(422, 'expires_in_hours must be between 0 and 8760');
    expires_at = new Date(Date.now() + h * 3600 * 1000).toISOString();
  }
  let max_uses = null;
  if (body.max_uses !== undefined && body.max_uses !== null && body.max_uses !== '') {
    max_uses = parseInt(body.max_uses, 10);
    if (!Number.isFinite(max_uses) || max_uses < 1) throw fail(422, 'max_uses must be a positive integer');
  }
  const { rows } = await query(
    `INSERT INTO access_links (tenant_id, exam_id, label, expires_at, max_uses, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *, (SELECT title FROM exams WHERE id = $2) AS exam_title`,
    [tenantId, exam_id, body.label ? String(body.label).slice(0, 200) : null, expires_at, max_uses, actor?.email || actor?.id || null]
  );
  return serializeLink(rows[0], tenantId);
}

export async function setAccessLinkActive(tenantId, linkId, isActive) {
  const { rows } = await query(
    `UPDATE access_links SET is_active = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2
     RETURNING *, (SELECT title FROM exams e WHERE e.id = access_links.exam_id) AS exam_title`,
    [linkId, tenantId, Boolean(isActive)]
  );
  return rows[0] ? serializeLink(rows[0], tenantId) : null;
}

async function resolveLink(token) {
  let decoded;
  try {
    decoded = verifyAccessLinkToken(String(token || ''));
  } catch {
    throw fail(401, 'This proctoring link is invalid or has expired.');
  }
  const { rows } = await query(
    `SELECT l.*, e.title AS exam_title, t.name AS tenant_name, t.status AS tenant_status
     FROM access_links l
     JOIN tenants t ON t.id = l.tenant_id
     LEFT JOIN exams e ON e.id = l.exam_id
     WHERE l.id = $1 AND l.tenant_id = $2`,
    [decoded.lid, decoded.tid]
  );
  const link = rows[0];
  if (!link || !link.is_active) throw fail(403, 'This proctoring link has been disabled.');
  if (link.tenant_status === 'suspended') throw fail(403, 'This organization is not accepting sessions.');
  if (link.expires_at && new Date(link.expires_at) < new Date()) throw fail(403, 'This proctoring link has expired.');
  if (link.max_uses && link.use_count >= link.max_uses) throw fail(403, 'This proctoring link has reached its limit.');
  return link;
}

export async function describeAccessLink(token) {
  const link = await resolveLink(token);
  const { rows } = await query(
    `SELECT logo_url, primary_color, organization_name, support_email, candidate_welcome_message
     FROM tenant_branding WHERE tenant_id = $1`,
    [link.tenant_id]
  );
  return {
    organization: rows[0]?.organization_name || link.tenant_name,
    branding: rows[0] || null,
    exam: link.exam_id ? { id: link.exam_id, title: link.exam_title } : null,
    requires_exam_title: !link.exam_id,
  };
}

/** Candidate self-start from a tenant link: full name is mandatory; exam name when link is unbound. */
export async function startFromAccessLink(token, body) {
  const link = await resolveLink(token);
  const tenantId = link.tenant_id;
  const candidate_name = String(body.candidate_name || '').trim().slice(0, 200);
  if (candidate_name.length < 2) throw fail(422, 'Full name is required.');
  const exam_title = link.exam_id ? null : String(body.exam_title || '').trim().slice(0, 300);
  if (!link.exam_id && !exam_title) throw fail(422, 'Exam name is required.');
  let candidate_email = body.candidate_email ? String(body.candidate_email).trim().toLowerCase().slice(0, 320) : null;
  if (candidate_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate_email)) throw fail(422, 'Email is not valid.');

  const client = await pool.connect();
  let sessionId;
  try {
    await client.query('BEGIN');
    const used = await client.query(
      `UPDATE access_links SET use_count = use_count + 1, updated_at = now()
       WHERE id = $1 AND (max_uses IS NULL OR use_count < max_uses) RETURNING id`,
      [link.id]
    );
    if (!used.rows[0]) throw fail(403, 'This proctoring link has reached its limit.');
    const examId = link.exam_id
      ? link.exam_id
      : (await findOrCreateExamContext(client, tenantId, { exam_title, source: 'access_link' })).id;
    const external_candidate_id = candidate_email ? `email:${candidate_email}` : `self-${crypto.randomUUID()}`;
    const candidate = await findOrCreateCandidate(client, tenantId, {
      external_candidate_id,
      candidate_name,
      candidate_email,
    });
    const { rows } = await client.query(
      `INSERT INTO exam_sessions
         (tenant_id, exam_id, candidate_id, external_ref, candidate_name, status, access_link_id, sdk_init_meta)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7::jsonb)
       RETURNING id`,
      [
        tenantId,
        examId,
        candidate.id,
        candidate.external_ref,
        candidate_name,
        link.id,
        JSON.stringify({ source: 'access_link', client_platform: body.client_platform || null }),
      ]
    );
    sessionId = rows[0].id;
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  const s = await getIntegrationSession(tenantId, sessionId);
  void emitWebhookEvent(tenantId, 'proctoring.session.created', webhookSessionData(s));
  return candidateBootstrap(tenantId, s);
}

function candidateBootstrap(tenantId, s) {
  return {
    session_id: s.id,
    status: s.status,
    candidate_name: s.candidate_name,
    exam: { id: s.exam_id, title: s.exam_title },
    ...issueCandidateCredentials(tenantId, s.id),
  };
}

/** Exchange an integration launch token for session-scoped browser credentials. */
export async function exchangeLaunchToken(token) {
  let decoded;
  try {
    decoded = verifyLaunchToken(String(token || ''));
  } catch {
    throw fail(401, 'This proctoring launch link is invalid or has expired. Please relaunch from your assessment.');
  }
  const { rows } = await query(`SELECT status FROM tenants WHERE id = $1`, [decoded.tid]);
  if (!rows[0]) throw fail(401, 'Invalid launch token.');
  if (rows[0].status === 'suspended') throw fail(403, 'This organization is not accepting sessions.');
  const s = await getIntegrationSession(decoded.tid, decoded.sid);
  if (!s) throw fail(404, 'Proctoring session not found.');
  if (['completed', 'failed', 'terminated'].includes(s.status)) {
    throw fail(409, `This proctoring session has already ${s.status === 'completed' ? 'been completed' : 'ended'}.`);
  }
  return candidateBootstrap(decoded.tid, s);
}
