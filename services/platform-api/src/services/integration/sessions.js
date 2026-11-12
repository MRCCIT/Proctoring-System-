import crypto from 'crypto';
import { pool, query } from '../../config/database.js';
import { config } from '../../config/index.js';
import { signLaunchToken, signSdkSessionToken, signSdkWsToken } from '../../utils/jwt.js';
import { buildSdkWsUrl } from '../sdk/candidateSessions.js';
import { emitWebhookEvent } from '../webhooks/dispatcher.js';

const OPEN_STATUSES = ['scheduled', 'active', 'paused'];

function fail(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

function str(v, max = 300) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Keys prefixed with `_` are internal bookkeeping (e.g. idempotency fingerprint). */
export function publicMetadata(meta) {
  return Object.fromEntries(Object.entries(meta || {}).filter(([k]) => !k.startsWith('_')));
}

/**
 * Find or create the exam context. External id wins over title when supplied.
 * Exams here are grouping contexts only — ProctorShield never owns questions/answers/timers.
 */
export async function findOrCreateExamContext(client, tenantId, { external_exam_id, exam_title, source }) {
  if (external_exam_id) {
    const { rows } = await client.query(
      `INSERT INTO exams (tenant_id, title, external_exam_id, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, external_exam_id) WHERE external_exam_id IS NOT NULL
       DO UPDATE SET title = CASE WHEN $5::boolean THEN EXCLUDED.title ELSE exams.title END, updated_at = now()
       RETURNING id, title, external_exam_id`,
      [tenantId, exam_title || external_exam_id, external_exam_id, source, Boolean(exam_title)]
    );
    return rows[0];
  }
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`exam:${tenantId}:${exam_title.toLowerCase()}`]);
  const found = await client.query(
    `SELECT id, title, external_exam_id FROM exams
     WHERE tenant_id = $1 AND external_exam_id IS NULL AND lower(trim(title)) = lower($2)
     ORDER BY created_at ASC LIMIT 1`,
    [tenantId, exam_title]
  );
  if (found.rows[0]) return found.rows[0];
  const { rows } = await client.query(
    `INSERT INTO exams (tenant_id, title, source) VALUES ($1, $2, $3) RETURNING id, title, external_exam_id`,
    [tenantId, exam_title, source]
  );
  return rows[0];
}

/** Candidates are keyed by the client's external id (never by name). */
export async function findOrCreateCandidate(client, tenantId, { external_candidate_id, candidate_name, candidate_email }) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `cand:${tenantId}:${external_candidate_id.toLowerCase()}`,
  ]);
  const byRef = await client.query(
    `SELECT id, name, email, external_ref FROM candidates
     WHERE tenant_id = $1 AND lower(trim(external_ref)) = lower($2) LIMIT 1`,
    [tenantId, external_candidate_id]
  );
  if (byRef.rows[0]) {
    const c = byRef.rows[0];
    const { rows } = await client.query(
      `UPDATE candidates
       SET name = COALESCE($3, name),
           email = CASE WHEN $4::text IS NOT NULL AND NOT EXISTS (
                     SELECT 1 FROM candidates x WHERE x.tenant_id = $2 AND x.email = $4 AND x.id <> $1
                   ) THEN $4 ELSE email END,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, email, external_ref`,
      [c.id, tenantId, candidate_name, candidate_email]
    );
    return rows[0];
  }
  if (candidate_email) {
    const byEmail = await client.query(
      `SELECT id, external_ref FROM candidates WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
      [tenantId, candidate_email]
    );
    const hit = byEmail.rows[0];
    if (hit && !hit.external_ref) {
      const { rows } = await client.query(
        `UPDATE candidates SET external_ref = $3, name = COALESCE($4, name), updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING id, name, email, external_ref`,
        [hit.id, tenantId, external_candidate_id, candidate_name]
      );
      return rows[0];
    }
    if (hit) candidate_email = null;
  }
  const { rows } = await client.query(
    `INSERT INTO candidates (tenant_id, email, name, external_ref)
     VALUES ($1, $2, $3, $4) RETURNING id, name, email, external_ref`,
    [tenantId, candidate_email, candidate_name, external_candidate_id]
  );
  return rows[0];
}

function requestFingerprint(input) {
  const stable = JSON.stringify([
    input.external_candidate_id,
    input.external_exam_id,
    input.exam_title,
    input.external_attempt_id,
  ]);
  return crypto.createHash('sha256').update(stable).digest('hex');
}

export function buildLaunch(tenantId, sessionId) {
  const ttl = config.launchTokenTtlSeconds;
  const launch_token = signLaunchToken({ tid: tenantId, sid: sessionId }, ttl);
  return {
    launch_token,
    launch_url: `${config.candidateAppUrl}/?launch=${encodeURIComponent(launch_token)}`,
    launch_expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

async function loadSessionSummary(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT s.id, s.status, s.created_at, s.started_at, s.ended_at, s.external_attempt_id, s.review_status,
            s.review_decision, s.integration_metadata, s.callback_url, s.violation_flags,
            COALESCE(s.candidate_name, c.name) AS candidate_name,
            c.id AS candidate_id, c.external_ref AS external_candidate_id, c.email AS candidate_email,
            e.id AS exam_id, e.title AS exam_title, e.external_exam_id
     FROM exam_sessions s
     LEFT JOIN candidates c ON c.id = s.candidate_id
     LEFT JOIN exams e ON e.id = s.exam_id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, tenantId]
  );
  return rows[0] || null;
}

export function serializeIntegrationSession(row) {
  return {
    session_id: row.id,
    status: row.status,
    created_at: row.created_at,
    started_at: row.started_at,
    ended_at: row.ended_at,
    external_attempt_id: row.external_attempt_id,
    review_status: row.review_status,
    review_decision: row.review_decision,
    metadata: publicMetadata(row.integration_metadata),
    callback_url: row.callback_url || null,
    candidate: {
      id: row.candidate_id,
      external_candidate_id: row.external_candidate_id,
      name: row.candidate_name,
      email: row.candidate_email || null,
    },
    exam: { id: row.exam_id, external_exam_id: row.external_exam_id, title: row.exam_title },
  };
}

function parseInput(body) {
  const input = {
    external_candidate_id: str(body.external_candidate_id, 200),
    candidate_name: str(body.candidate_name, 200),
    candidate_email: str(body.candidate_email, 320)?.toLowerCase() || null,
    external_exam_id: str(body.external_exam_id, 200),
    exam_title: str(body.exam_title, 300),
    external_attempt_id: str(body.external_attempt_id, 200),
    callback_url: str(body.callback_url, 2000),
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {},
  };
  const errors = [];
  if (!input.external_candidate_id) errors.push('external_candidate_id is required');
  if (!input.candidate_name) errors.push('candidate_name is required');
  if (!input.external_exam_id && !input.exam_title) errors.push('external_exam_id or exam_title is required');
  if (input.candidate_email && !isEmail(input.candidate_email)) errors.push('candidate_email is not a valid email');
  if (input.callback_url && !isHttpUrl(input.callback_url)) errors.push('callback_url must be an http(s) URL');
  if (JSON.stringify(input.metadata).length > 16_000) errors.push('metadata is too large (max 16KB)');
  if (errors.length) throw fail(422, errors.join('; '), { errors });
  return input;
}

/**
 * Server-to-server session initiation.
 * - Idempotency-Key: replays return the original session (409 if the key is reused with different input).
 * - Duplicate prevention: an open session for the same candidate + exam (+ attempt) is returned instead
 *   of creating a parallel one; a closed session for the same external attempt is a conflict.
 */
export async function createIntegrationSession(tenantId, body, { idempotencyKey, retried = false } = {}) {
  const input = parseInput(body || {});
  const key = str(idempotencyKey, 200);
  const fingerprint = requestFingerprint(input);
  try {
    const { assertSessionAdmission } = await import('../infra/admissionControl.js');
    await assertSessionAdmission(tenantId);
  } catch (e) {
    if (e.status === 429) throw e;
    /* fail open if admission infra errors — do not block exams */
  }

  if (key) {
    const { rows } = await query(
      `SELECT id, integration_metadata FROM exam_sessions WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, key]
    );
    if (rows[0]) {
      if (rows[0].integration_metadata?._fingerprint !== fingerprint) {
        throw fail(409, 'Idempotency-Key was already used with a different request.');
      }
      const s = await loadSessionSummary(tenantId, rows[0].id);
      return { session: s, created: false, reason: 'idempotent_replay' };
    }
  }

  const client = await pool.connect();
  let sessionId;
  let created = false;
  let reason = null;
  try {
    await client.query('BEGIN');
    const exam = await findOrCreateExamContext(client, tenantId, {
      external_exam_id: input.external_exam_id,
      exam_title: input.exam_title,
      source: 'integration',
    });
    const candidate = await findOrCreateCandidate(client, tenantId, input);

    const dupParams = [tenantId, exam.id, candidate.id];
    let dupWhere = `tenant_id = $1 AND exam_id = $2 AND candidate_id = $3`;
    if (input.external_attempt_id) {
      dupParams.push(input.external_attempt_id);
      dupWhere += ` AND external_attempt_id = $4`;
    } else {
      dupWhere += ` AND external_attempt_id IS NULL AND status = ANY('{scheduled,active,paused}')`;
    }
    const dup = await client.query(
      `SELECT id, status FROM exam_sessions WHERE ${dupWhere} ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      dupParams
    );
    if (dup.rows[0]) {
      if (!OPEN_STATUSES.includes(dup.rows[0].status)) {
        throw fail(409, `A proctoring session for this attempt already exists and is ${dup.rows[0].status}.`, {
          session_id: dup.rows[0].id,
        });
      }
      sessionId = dup.rows[0].id;
      reason = 'existing_open_session';
    } else {
      const meta = { ...input.metadata, _fingerprint: fingerprint };
      const { rows } = await client.query(
        `INSERT INTO exam_sessions
           (tenant_id, exam_id, candidate_id, external_ref, candidate_name, external_attempt_id, idempotency_key,
            integration_metadata, callback_url, status, sdk_init_meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'scheduled', $10::jsonb)
         RETURNING id`,
        [
          tenantId,
          exam.id,
          candidate.id,
          input.external_candidate_id,
          input.candidate_name,
          input.external_attempt_id,
          key,
          JSON.stringify(meta),
          input.callback_url,
          JSON.stringify({ source: 'integration' }),
        ]
      );
      sessionId = rows[0].id;
      created = true;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505' && !retried) {
      return createIntegrationSession(tenantId, body, { idempotencyKey, retried: true });
    }
    throw e;
  } finally {
    client.release();
  }

  const session = await loadSessionSummary(tenantId, sessionId);
  if (created) {
    void emitWebhookEvent(tenantId, 'proctoring.session.created', webhookSessionData(session));
  }
  return { session, created, reason };
}

export function webhookSessionData(s) {
  return {
    session_id: s.id,
    status: s.status,
    external_candidate_id: s.external_candidate_id,
    candidate_name: s.candidate_name,
    external_exam_id: s.external_exam_id,
    exam_title: s.exam_title,
    external_attempt_id: s.external_attempt_id,
    metadata: publicMetadata(s.integration_metadata),
  };
}

export async function getIntegrationSession(tenantId, sessionId) {
  return loadSessionSummary(tenantId, sessionId);
}

export async function listIntegrationSessions(tenantId, { external_candidate_id, external_exam_id, external_attempt_id, limit }) {
  const params = [tenantId];
  let where = 'WHERE s.tenant_id = $1';
  if (external_candidate_id) {
    params.push(String(external_candidate_id));
    where += ` AND lower(trim(c.external_ref)) = lower($${params.length})`;
  }
  if (external_exam_id) {
    params.push(String(external_exam_id));
    where += ` AND e.external_exam_id = $${params.length}`;
  }
  if (external_attempt_id) {
    params.push(String(external_attempt_id));
    where += ` AND s.external_attempt_id = $${params.length}`;
  }
  params.push(Math.min(100, Math.max(1, parseInt(limit, 10) || 25)));
  const { rows } = await query(
    `SELECT s.id, s.status, s.created_at, s.started_at, s.ended_at, s.external_attempt_id, s.review_status,
            s.review_decision, s.integration_metadata, s.callback_url, s.violation_flags,
            COALESCE(s.candidate_name, c.name) AS candidate_name,
            c.id AS candidate_id, c.external_ref AS external_candidate_id, c.email AS candidate_email,
            e.id AS exam_id, e.title AS exam_title, e.external_exam_id
     FROM exam_sessions s
     LEFT JOIN candidates c ON c.id = s.candidate_id
     LEFT JOIN exams e ON e.id = s.exam_id
     ${where}
     ORDER BY s.created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

/** Credentials the candidate browser uses after exchanging a launch/access token. */
export function issueCandidateCredentials(tenantId, sessionId) {
  return {
    session_token: signSdkSessionToken({ tid: tenantId, sid: sessionId }),
    ws_token: signSdkWsToken({ tid: tenantId, sid: sessionId }, 8 * 3600),
    ws_url: buildSdkWsUrl(sessionId),
  };
}
