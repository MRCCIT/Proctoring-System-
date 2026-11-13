import { pool, query } from '../../config/database.js';
import { enrichEvent } from '../events/violationCatalog.js';
import { buildEvidenceSignedUrl } from './sdk.js';
import { listSessionRecordingsForPlayback } from './recordingMerge.js';
import { getSessionEnriched } from './sessionQueries.js';
import { emitSessionWebhook } from '../sdk/candidateSessions.js';
import { refreshExamAggregate } from '../aggregates/examAggregates.js';

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function actorFields(actor) {
  return {
    actor_type: actor?.type || 'system',
    actor_id: actor?.id ? String(actor.id) : null,
    actor_email: actor?.email || null,
  };
}

function actorLabel(actor) {
  return actor?.email || actor?.id || actor?.type || 'system';
}

async function logReview(client, tenantId, sessionId, action, { eventId = null, note = null, actor }) {
  const a = actorFields(actor);
  await client.query(
    `INSERT INTO session_reviews (tenant_id, session_id, event_id, action, note, actor_type, actor_id, actor_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [tenantId, sessionId, eventId, action, note, a.actor_type, a.actor_id, a.actor_email]
  );
}

/** Recording reference time: first recorded media for the session (fallback: stream start). */
async function recordingOrigin(tenantId, sessionId, session) {
  const { rows } = await query(
    `SELECT min(started_at) AS t FROM session_recording_chunks
     WHERE tenant_id = $1 AND session_id = $2 AND track = 'camera' AND started_at IS NOT NULL`,
    [tenantId, sessionId]
  );
  return rows[0]?.t || session.stream_started_at || session.started_at || null;
}

export async function getSessionTimeline(tenantId, sessionId) {
  const session = await getSessionEnriched(tenantId, sessionId);
  if (!session) return null;
  const origin = await recordingOrigin(tenantId, sessionId, session);
  const { rows } = await query(
    `SELECT id, event_type, severity, payload, occurred_at, source, review_status, reviewed_by, reviewed_at, review_note
     FROM session_events WHERE tenant_id = $1 AND session_id = $2
     ORDER BY occurred_at ASC, id ASC`,
    [tenantId, sessionId]
  );
  const originMs = origin ? new Date(origin).getTime() : null;
  const events = rows.map((r) => {
    const e = enrichEvent(r);
    return {
      ...e,
      id: String(r.id),
      offset_seconds: originMs != null ? Math.max(0, (new Date(r.occurred_at).getTime() - originMs) / 1000) : null,
    };
  });
  return { session, recording_origin: origin, events };
}

export async function getSessionEvidence(tenantId, sessionId) {
  const session = await getSessionEnriched(tenantId, sessionId);
  if (!session) return null;
  const origin = await recordingOrigin(tenantId, sessionId, session);
  const recordings = await listSessionRecordingsForPlayback(tenantId, sessionId);
  const { rows: snaps } = await query(
    `SELECT id, caption, violation_context, captured_at, mime_type, bytes, source, file_path
     FROM session_snapshots WHERE tenant_id = $1 AND session_id = $2 ORDER BY captured_at ASC`,
    [tenantId, sessionId]
  );
  const originMs = origin ? new Date(origin).getTime() : null;
  return {
    recording_origin: origin,
    expires_in_seconds: parseInt(process.env.SIGNED_LINK_TTL_SECONDS || '900', 10) || 900,
    recordings: recordings.map((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {};
      return {
        id: String(r.id),
        track: r.track,
        merged: meta.merged === true,
        display_name: meta.display_name || `${r.track}-${r.sequence}`,
        mime_type: r.mime_type,
        bytes: r.bytes != null ? Number(r.bytes) : null,
        duration_ms: r.duration_ms,
        started_at: r.started_at,
        ended_at: r.ended_at,
        url: r.file_path ? buildEvidenceSignedUrl(tenantId, 'recording', r.id) : null,
      };
    }),
    snapshots: snaps.map((s) => ({
      id: s.id,
      caption: s.caption,
      violation_context: s.violation_context,
      captured_at: s.captured_at,
      source: s.source,
      offset_seconds: originMs != null ? Math.max(0, (new Date(s.captured_at).getTime() - originMs) / 1000) : null,
      url: s.file_path ? buildEvidenceSignedUrl(tenantId, 'snapshot', s.id) : null,
    })),
  };
}

export async function listReviewHistory(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT r.id, r.event_id, r.action, r.note, r.actor_type, r.actor_id, r.actor_email, r.created_at,
            se.event_type
     FROM session_reviews r
     LEFT JOIN session_events se ON se.id = r.event_id
     WHERE r.tenant_id = $1 AND r.session_id = $2
     ORDER BY r.created_at DESC`,
    [tenantId, sessionId]
  );
  return rows.map((r) => ({ ...r, id: String(r.id), event_id: r.event_id ? String(r.event_id) : null }));
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function startReview(tenantId, sessionId, actor) {
  return withTx(async (client) => {
    const { rows } = await client.query(
      `UPDATE exam_sessions SET review_status = 'in_review', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND review_status = 'pending' RETURNING id`,
      [sessionId, tenantId]
    );
    const { rows: exists } = await client.query(`SELECT id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
      sessionId,
      tenantId,
    ]);
    if (!exists[0]) throw fail(404, 'Session not found');
    if (rows[0]) await logReview(client, tenantId, sessionId, 'review_started', { actor });
    return { started: Boolean(rows[0]) };
  });
}

const DECISION_ACTIONS = { cleared: 'session_cleared', flagged: 'session_flagged', inconclusive: 'session_inconclusive' };

/** Human review outcome. Integrity decision only — never an exam result or a misconduct verdict. */
export async function decideSession(tenantId, sessionId, { decision, summary }, actor) {
  if (!DECISION_ACTIONS[decision]) throw fail(422, 'decision must be one of: cleared, flagged, inconclusive');
  const note = summary ? String(summary).trim().slice(0, 4000) : null;
  if (decision !== 'cleared' && !note) throw fail(422, 'A review summary is required when flagging or marking inconclusive.');
  const out = await withTx(async (client) => {
    const { rows } = await client.query(
      `UPDATE exam_sessions
       SET review_status = 'reviewed', review_decision = $3, review_summary = $4,
           reviewed_by = $5, reviewed_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, review_status, review_decision, review_summary, reviewed_by, reviewed_at`,
      [sessionId, tenantId, decision, note, actorLabel(actor)]
    );
    if (!rows[0]) throw fail(404, 'Session not found');
    await logReview(client, tenantId, sessionId, DECISION_ACTIONS[decision], { note, actor });
    return rows[0];
  });
  void emitSessionWebhook(tenantId, sessionId, 'proctoring.review.completed', {
    review_decision: out.review_decision,
    reviewed_at: out.reviewed_at,
  });
  const { rows: examRows } = await query(`SELECT exam_id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
    sessionId,
    tenantId,
  ]);
  if (examRows[0]?.exam_id) {
    void refreshExamAggregate(examRows[0].exam_id, { updateRisk: false }).catch(() => {});
  }
  return out;
}

const EVENT_ACTIONS = {
  confirm: { status: 'confirmed', action: 'event_confirmed' },
  dismiss: { status: 'dismissed', action: 'event_dismissed' },
  reopen: { status: 'open', action: 'event_reopened' },
};

export async function reviewEvent(tenantId, sessionId, eventId, { action, note }, actor) {
  const spec = EVENT_ACTIONS[action];
  if (!spec) throw fail(422, 'action must be one of: confirm, dismiss, reopen');
  if (!/^\d+$/.test(String(eventId))) throw fail(400, 'Invalid event id');
  const text = note ? String(note).trim().slice(0, 2000) : null;
  if (action === 'dismiss' && !text) throw fail(422, 'A note is required to dismiss a detection.');
  return withTx(async (client) => {
    const { rows } = await client.query(
      `UPDATE session_events
       SET review_status = $4, review_note = COALESCE($5, review_note), reviewed_by = $6, reviewed_at = now()
       WHERE id = $1 AND session_id = $2 AND tenant_id = $3
       RETURNING id, event_type, severity, review_status, review_note, reviewed_by, reviewed_at`,
      [eventId, sessionId, tenantId, spec.status, text, actorLabel(actor)]
    );
    if (!rows[0]) throw fail(404, 'Event not found');
    await client.query(
      `UPDATE exam_sessions SET review_status = 'in_review', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND review_status = 'pending'`,
      [sessionId, tenantId]
    );
    await logReview(client, tenantId, sessionId, spec.action, { eventId, note: text, actor });
    return { ...rows[0], id: String(rows[0].id) };
  });
}

export async function addManualIncident(tenantId, sessionId, { note, occurred_at }, actor) {
  const text = String(note || '').trim().slice(0, 2000);
  if (!text) throw fail(422, 'note is required');
  const at = occurred_at ? new Date(occurred_at) : new Date();
  if (Number.isNaN(at.getTime())) throw fail(422, 'occurred_at is invalid');
  return withTx(async (client) => {
    const { rows: s } = await client.query(`SELECT id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
      sessionId,
      tenantId,
    ]);
    if (!s[0]) throw fail(404, 'Session not found');
    const { rows } = await client.query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at, source, review_status, reviewed_by, reviewed_at, review_note)
       VALUES ($1, $2, 'violation.manual_incident', 'flag', $3::jsonb, $4, 'proctor', 'confirmed', $5, now(), $6)
       RETURNING id, occurred_at`,
      [tenantId, sessionId, JSON.stringify({ note: text }), at.toISOString(), actorLabel(actor), text]
    );
    await logReview(client, tenantId, sessionId, 'manual_incident', { eventId: rows[0].id, note: text, actor });
    return { id: String(rows[0].id), occurred_at: rows[0].occurred_at };
  });
}

export async function addReviewNote(tenantId, sessionId, { note }, actor) {
  const text = String(note || '').trim().slice(0, 4000);
  if (!text) throw fail(422, 'note is required');
  return withTx(async (client) => {
    const { rows } = await client.query(`SELECT id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [
      sessionId,
      tenantId,
    ]);
    if (!rows[0]) throw fail(404, 'Session not found');
    await logReview(client, tenantId, sessionId, 'note', { note: text, actor });
    return { ok: true };
  });
}

function summarize(values) {
  const v = values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  if (!v.length) return { samples: 0, average: null, minimum: null };
  return {
    samples: v.length,
    average: Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)),
    minimum: Number(Math.min(...v).toFixed(1)),
  };
}

/**
 * Proctoring Integrity Report: what was observed, what reviewers decided, and the evidence available.
 * No scores or answers (ProctorShield does not own the assessment) and no automated guilt verdict.
 */
export async function buildIntegrityReport(tenantId, sessionId) {
  const timeline = await getSessionTimeline(tenantId, sessionId);
  if (!timeline) return null;
  const { session, events, recording_origin } = timeline;
  const [evidence, history, checks, identity, faceChecks, tenantRows] = await Promise.all([
    getSessionEvidence(tenantId, sessionId),
    listReviewHistory(tenantId, sessionId),
    query(
      `SELECT results, client_info, created_at FROM sdk_system_checks
       WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, sessionId]
    ),
    query(
      `SELECT count(*)::int AS submissions, max(created_at) AS last_at FROM sdk_identity_submissions
       WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, sessionId]
    ),
    query(
      `SELECT match_score, face_count FROM session_face_checks WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, sessionId]
    ),
    query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]),
  ]);

  const violations = events.filter((e) => e.is_violation);
  const byCode = new Map();
  for (const e of violations) {
    const k = e.code;
    if (!byCode.has(k)) {
      byCode.set(k, {
        code: k,
        label: e.label,
        category: e.category,
        severity: e.severity,
        total: 0,
        open: 0,
        confirmed: 0,
        dismissed: 0,
        first_at: e.occurred_at,
        last_at: e.occurred_at,
      });
    }
    const g = byCode.get(k);
    g.total += 1;
    g[e.review_status] += 1;
    g.last_at = e.occurred_at;
  }

  const scores = faceChecks.rows.map((r) => r.match_score);
  const idSummary = summarize(scores);
  const lowMatches = scores.filter((s) => s != null && Number(s) < 50).length;

  return {
    report_type: 'proctoring_integrity_report',
    version: 1,
    generated_at: new Date().toISOString(),
    organization: tenantRows.rows[0]?.name || null,
    session: {
      id: session.id,
      status: session.status,
      created_at: session.created_at,
      started_at: session.started_at,
      ended_at: session.ended_at,
      duration_seconds: session.duration_seconds,
      external_attempt_id: session.external_attempt_id,
    },
    candidate: {
      name: session.candidate_name,
      external_candidate_id: session.external_candidate_id || session.external_ref,
      email: session.candidate_email,
    },
    exam: { id: session.exam_id, title: session.exam_title, external_exam_id: session.external_exam_id },
    pre_check: checks.rows[0]
      ? { completed_at: checks.rows[0].created_at, results: checks.rows[0].results, environment: checks.rows[0].client_info }
      : null,
    identity: {
      reference_submissions: identity.rows[0]?.submissions || 0,
      continuous_verification: { ...idSummary, low_match_samples: lowMatches },
    },
    violations: {
      total: violations.length,
      open: violations.filter((v) => v.review_status === 'open').length,
      confirmed: violations.filter((v) => v.review_status === 'confirmed').length,
      dismissed: violations.filter((v) => v.review_status === 'dismissed').length,
      by_type: [...byCode.values()].sort((a, b) => b.total - a.total),
    },
    timeline: violations.map((v) => ({
      id: v.id,
      occurred_at: v.occurred_at,
      offset_seconds: v.offset_seconds,
      code: v.code,
      label: v.label,
      category: v.category,
      severity: v.severity,
      source: v.source,
      review_status: v.review_status,
      review_note: v.review_note,
    })),
    evidence: {
      recording_origin,
      recordings: evidence.recordings.map(({ url, ...r }) => r),
      snapshot_count: evidence.snapshots.length,
    },
    review: {
      status: session.review_status,
      decision: session.review_decision,
      summary: session.review_summary,
      reviewed_by: session.reviewed_by,
      reviewed_at: session.reviewed_at,
      history: history.map((h) => ({
        action: h.action,
        note: h.note,
        actor: h.actor_email || h.actor_id || h.actor_type,
        at: h.created_at,
      })),
    },
    disclaimer:
      'This report summarizes automated proctoring signals and human review activity. Automated detections are ' +
      'indicators that require human judgement; they are not determinations of misconduct. Assessment scores and ' +
      'outcomes are owned by the assessment platform.',
  };
}
