import crypto from 'crypto';
import { pool, query } from '../../config/database.js';
import { config } from '../../config/index.js';
import { signSdkWsToken, signSdkSessionToken } from '../../utils/jwt.js';
import { getOrCreateExamLockdownPolicy } from '../lockdown/policyStore.js';
import { getExamLoadLevel, getTenantLoadLevel, policyForLevel } from '../capacity/loadLevelStore.js';
import { mergeSessionRecordings } from '../tenant/recordingMerge.js';
import { emitWebhookEvent } from '../webhooks/dispatcher.js';
import { assertSessionAdmission, onSessionStarted, onSessionEnded } from '../infra/admissionControl.js';
import { resolveEffectivePolicy } from '../tenant/resolvePolicy.js';
import { clipAiModules } from '../tenant/aiFeatureAllowList.js';

export function buildSdkWsUrl(sessionId) {
  const base = config.publicApiBaseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${base}/v1/sdk/ws/sessions/${sessionId}`;
}

export async function assertSessionForTenant(tenantId, sessionId) {
  const { rows } = await query(`SELECT id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [sessionId, tenantId]);
  return rows[0] || null;
}

export async function initSdkSession(tenantId, body) {
  let exam_id = body.exam_id || null;
  let candidate_id = body.candidate_id || null;
  const candidate_name = body.candidate_name ? String(body.candidate_name).trim().slice(0, 200) || null : null;
  const exam_title = body.exam_title ? String(body.exam_title).trim().slice(0, 300) || null : null;
  if (!exam_id && exam_title) {
    const { findOrCreateExamContext } = await import('../integration/sessions.js');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exam = await findOrCreateExamContext(client, tenantId, { exam_title, source: 'sdk' });
      await client.query('COMMIT');
      exam_id = exam.id;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  if (exam_id) {
    const ex = await query(`SELECT id FROM exams WHERE id = $1 AND tenant_id = $2`, [exam_id, tenantId]);
    if (!ex.rows.length) {
      const e = new Error('Exam not found');
      e.status = 404;
      throw e;
    }
  }
  if (candidate_id) {
    const c = await query(`SELECT id FROM candidates WHERE id = $1 AND tenant_id = $2`, [candidate_id, tenantId]);
    if (!c.rows.length) {
      const e = new Error('Candidate not found');
      e.status = 404;
      throw e;
    }
  }
  const external_ref =
    (body.external_candidate_ref && String(body.external_candidate_ref)) ||
    (body.external_ref && String(body.external_ref)) ||
    `sdk-${crypto.randomUUID()}`;
  const sdk_init_meta = {
    ...(typeof body.metadata === 'object' && body.metadata ? body.metadata : {}),
    sdk_version: body.sdk_version || null,
    client_platform: body.client_platform || null,
  };
  const scheduled_start = body.scheduled_start || null;
  const scheduled_end = body.scheduled_end || null;
  await assertSessionAdmission(tenantId);
  const policy = await resolveEffectivePolicy(tenantId, {
    examId: exam_id,
    overrides: body.ai_config && typeof body.ai_config === 'object' ? body.ai_config : null,
  });
  const { rows } = await query(
    `INSERT INTO exam_sessions (tenant_id, exam_id, candidate_id, external_ref, status, sdk_init_meta, scheduled_start, scheduled_end, ai_config, candidate_name)
     VALUES ($1, $2, $3, $4, 'scheduled', $5::jsonb, $6::timestamptz, $7::timestamptz, $8::jsonb, $9)
     RETURNING id, created_at`,
    [
      tenantId,
      exam_id,
      candidate_id,
      external_ref,
      JSON.stringify(sdk_init_meta),
      scheduled_start,
      scheduled_end,
      JSON.stringify(policy),
      candidate_name,
    ]
  );
  const session = rows[0];
  const ws_token = signSdkWsToken({ tid: tenantId, sid: session.id }, 86400);
  const ws_url = buildSdkWsUrl(session.id);

  // Auto-enroll: anyone who starts an exam appears on the Candidates list.
  if (!candidate_id && external_ref && String(external_ref).trim()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { findOrCreateCandidate } = await import('../integration/sessions.js');
      const emailRaw = body.candidate_email ? String(body.candidate_email).trim().toLowerCase() : '';
      const cand = await findOrCreateCandidate(client, tenantId, {
        external_candidate_id: String(external_ref).trim(),
        candidate_name: candidate_name || String(external_ref).trim(),
        candidate_email: emailRaw || null,
      });
      await client.query(
        `UPDATE exam_sessions
            SET candidate_id = $1,
                candidate_name = COALESCE(NULLIF(candidate_name, ''), $2),
                updated_at = now()
          WHERE id = $3 AND tenant_id = $4`,
        [cand.id, candidate_name || cand.name, session.id, tenantId]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    session_id: session.id,
    ws_url,
    ws_token,
    external_ref,
    created_at: session.created_at,
  };
}

export async function getSdkSessionConfig(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT s.id, s.status, s.ai_config, s.scheduled_start, s.scheduled_end, s.exam_id, s.candidate_name,
            e.title AS exam_title, e.ai_sensitivity, e.ai_modules, e.policy_template, e.branding, e.scheduling AS exam_scheduling,
            t.feature_flags AS tenant_feature_flags
     FROM exam_sessions s
     LEFT JOIN exams e ON e.id = s.exam_id
     JOIN tenants t ON t.id = s.tenant_id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, tenantId]
  );
  const row = rows[0];
  if (!row) return null;
  let lockdown_policy = null;
  if (row.exam_id) {
    try {
      lockdown_policy = await getOrCreateExamLockdownPolicy(tenantId, row.exam_id);
    } catch {
      lockdown_policy = null;
    }
  }
  const load_level = row.exam_id ? getExamLoadLevel(tenantId, row.exam_id) : getTenantLoadLevel(tenantId);
  return {
    session: {
      id: row.id,
      status: row.status,
      candidate_name: row.candidate_name,
      scheduled_start: row.scheduled_start,
      scheduled_end: row.scheduled_end,
    },
    exam: row.exam_id
      ? {
          id: row.exam_id,
          title: row.exam_title,
          scheduling: row.exam_scheduling,
          ai_sensitivity: row.ai_sensitivity,
          ai_modules: row.ai_modules,
          policy_template: row.policy_template,
          branding: row.branding,
        }
      : null,
    tenant_feature_flags: row.tenant_feature_flags,
    policy: (() => {
      const flags = row.tenant_feature_flags || {};
      const base =
        row.ai_config && typeof row.ai_config === 'object' && row.ai_config.ai_modules
          ? { ...row.ai_config }
          : {
              source: 'exam',
              ai_modules: row.ai_modules || {},
              ai_sensitivity: row.ai_sensitivity || 'normal',
              grace_period_seconds: 5,
              severity_thresholds: { warn: 1, flag: 3, terminate: 8 },
              whitelist: {},
              rules: row.policy_template || {},
            };
      return { ...base, ai_modules: clipAiModules(base.ai_modules || {}, flags) };
    })(),
    effective_ai_config: {
      session: row.ai_config,
      exam_modules: row.ai_modules,
      tenant_feature_flags: row.tenant_feature_flags,
    },
    pre_exam_checklist: {
      hardware: ['webcam', 'microphone', 'screen_resolution'],
      network: ['latency', 'packet_loss'],
      browser: ['compatibility_matrix'],
      environment: ['applications', 'external_monitors'],
      identity: ['photo_vs_id_template'],
    },
    secure_environment: {
      lockdown: ['disable_copy_paste', 'disable_context_menu', 'block_shortcuts'],
      tab_detection: true,
      screen_capture_mitigation: true,
      extension_interference: 'blocked',
    },
    lockdown_policy,
    load_level,
    load_policy: policyForLevel(load_level),
  };
}

export function issueCandidateCredentials(tenantId, sessionId) {
  return {
    session_token: signSdkSessionToken({ tid: tenantId, sid: sessionId }),
    ws_token: signSdkWsToken({ tid: tenantId, sid: sessionId }),
  };
}

export async function recordSystemCheck(tenantId, sessionId, body) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  const results = body.results || body.checks || {};
  const client_info = body.client_info || body.environment || {};
  const { rows } = await query(
    `INSERT INTO sdk_system_checks (tenant_id, session_id, results, client_info)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id, created_at`,
    [tenantId, sessionId, JSON.stringify(results), JSON.stringify(client_info)]
  );
  return rows[0];
}

const MAX_IDENTITY_BODY_CHARS = 400_000;

export async function recordIdentity(tenantId, sessionId, body) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  const raw = JSON.stringify(body || {});
  if (raw.length > MAX_IDENTITY_BODY_CHARS) {
    const e = new Error('Identity payload too large');
    e.status = 413;
    throw e;
  }
  const object_key =
    body.object_key ||
    (body.image_base64 ? `identity/pending/${sessionId}.bin` : null) ||
    `identity/metadata/${sessionId}`;
  const metadata = {
    ...(body.metadata || {}),
    has_image: Boolean(body.image_base64),
    image_bytes_approx: body.image_base64 ? Buffer.byteLength(String(body.image_base64), 'utf8') : 0,
  };
  const { rows } = await query(
    `INSERT INTO sdk_identity_submissions (tenant_id, session_id, object_key, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, created_at`,
    [tenantId, sessionId, object_key, JSON.stringify(metadata)]
  );
  return { submission: rows[0], storage_note: 'Upload binary to object storage; this row stores metadata only.' };
}

export async function startMediaStream(tenantId, sessionId, body) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  const { rows: prev } = await query(`SELECT status FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
    sessionId,
    tenantId,
  ]);
  if (['completed', 'failed', 'terminated'].includes(prev[0]?.status)) {
    const e = new Error(`Session is already ${prev[0].status}`);
    e.status = 409;
    throw e;
  }
  const { rows } = await query(
    `UPDATE exam_sessions
     SET stream_started_at = COALESCE(stream_started_at, now()),
         status = CASE WHEN status = 'scheduled' THEN 'active' ELSE status END,
         started_at = COALESCE(started_at, now()),
         connection_state = 'connected',
         last_heartbeat_at = now(),
         updated_at = now(),
         sdk_init_meta = sdk_init_meta || $2::jsonb
     WHERE id = $1 AND tenant_id = $3
     RETURNING id, status, stream_started_at, started_at`,
    [sessionId, JSON.stringify({ stream: body?.transport || {} }), tenantId]
  );
  if (prev[0]?.status === 'scheduled') {
    void onSessionStarted(tenantId);
    void emitSessionWebhook(tenantId, sessionId, 'proctoring.session.started');
  }
  return rows[0];
}

export async function emitSessionWebhook(tenantId, sessionId, eventType, extra = {}) {
  try {
    const { getIntegrationSession, webhookSessionData } = await import('../integration/sessions.js');
    const s = await getIntegrationSession(tenantId, sessionId);
    if (!s) return;
    await emitWebhookEvent(tenantId, eventType, { ...webhookSessionData(s), ...extra });
  } catch (e) {
    console.warn('[webhooks] session event failed', eventType, e.message);
  }
}

/**
 * Close a proctoring session exactly once. Repeated calls return the existing closed state
 * (idempotent) instead of overwriting the original outcome.
 */
export async function closeSession(tenantId, sessionId, { status = 'completed', reason = null, success } = {}) {
  const allowed = ['completed', 'failed', 'terminated'];
  const nextStatus = allowed.includes(status) ? status : 'completed';
  const { rows } = await query(
    `UPDATE exam_sessions
     SET status = $2,
         ended_at = COALESCE(ended_at, now()),
         stream_ended_at = COALESCE(stream_ended_at, now()),
         success = COALESCE($3::boolean, success),
         connection_state = 'closed',
         updated_at = now(),
         sdk_init_meta = sdk_init_meta || $4::jsonb
     WHERE id = $1 AND tenant_id = $5 AND status NOT IN ('completed', 'failed', 'terminated')
     RETURNING id, status, ended_at`,
    [sessionId, nextStatus, success === undefined ? null : success, JSON.stringify({ end: { reason } }), tenantId]
  );
  if (!rows[0]) {
    const { rows: cur } = await query(`SELECT id, status, ended_at FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
      sessionId,
      tenantId,
    ]);
    return { session: cur[0] || null, alreadyClosed: Boolean(cur[0]) };
  }
  void onSessionEnded(tenantId);
  try {
    await mergeSessionRecordings(tenantId, sessionId);
  } catch (e) {
    console.warn('[recording] merge on session end failed:', e.message);
  }
  void import('../media/postExamProcess.js')
    .then((m) => m.runPostExamMediaJob(tenantId, sessionId))
    .catch((e) => console.warn('[media] post-exam stub failed:', e.message));
  const evt = nextStatus === 'terminated' ? 'proctoring.session.terminated' : 'proctoring.session.completed';
  void emitSessionWebhook(tenantId, sessionId, evt, { reason });
  void emitSessionWebhook(tenantId, sessionId, 'proctoring.evidence.available');
  return { session: rows[0], alreadyClosed: false };
}

export async function endSdkSession(tenantId, sessionId, body) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  const { session } = await closeSession(tenantId, sessionId, {
    status: body?.status || 'completed',
    reason: body?.reason || null,
    success: body?.success,
  });
  return session;
}
