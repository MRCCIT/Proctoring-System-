import { query } from '../../config/database.js';
import { getLatestLockdownPolicy } from './policyStore.js';
import { verifyLockdownBatch } from './sign.js';
import { config } from '../../config/index.js';
import { mapLockdownEventToViolation } from './eventMapping.js';

function signingSecret() {
  return process.env.LOCKDOWN_SIGNING_SECRET || config.jwtSecret;
}

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

/**
 * Ingest signed lockdown event batches into session_events.
 * Never trust the client alone — verify policy version against DB and reject bad batch signatures.
 */
export async function ingestLockdownEvents(tenantId, sessionId, body) {
  if (!SESSION_ID_RE.test(String(sessionId))) fail(422, 'Invalid session id');
  if (body?.session_id && String(body.session_id) !== String(sessionId)) {
    fail(422, 'Batch session_id does not match URL');
  }

  const { rows: sessions } = await query(
    `SELECT id, exam_id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  const session = sessions[0];
  if (!session) fail(404, 'Session not found');

  const policyRow = session.exam_id ? await getLatestLockdownPolicy(tenantId, session.exam_id) : null;
  const events = Array.isArray(body?.events) ? body.events : [];
  const batchPolicyVersion = body?.policy_version != null ? Number(body.policy_version) : null;

  const requireSig =
    process.env.LOCKDOWN_REQUIRE_BATCH_SIG === 'true' ||
    process.env.LOCKDOWN_REQUIRE_BATCH_SIG === '1' ||
    Boolean(body?.signature);
  if (requireSig) {
    const batchDoc = {
      session_id: sessionId,
      policy_version: batchPolicyVersion ?? policyRow?.version ?? 0,
      events,
    };
    const ok = verifyLockdownBatch(batchDoc, body?.signature, signingSecret());
    if (!ok) fail(422, 'Invalid lockdown batch signature');
  }

  if (policyRow && batchPolicyVersion != null && Number(batchPolicyVersion) !== Number(policyRow.version)) {
    fail(422, 'Stale lockdown policy version');
  }

  let accepted = 0;
  let duplicate = 0;
  let rejected = 0;
  const seenSeq = new Set();
  const seenIdem = new Set();

  for (const ev of events) {
    const seq = Number(ev?.seq);
    if (!Number.isFinite(seq) || seq < 1) {
      rejected += 1;
      continue;
    }
    if (seenSeq.has(seq)) {
      rejected += 1;
      continue;
    }
    seenSeq.add(seq);

    if (batchPolicyVersion != null && ev.policy_version != null && Number(ev.policy_version) !== Number(batchPolicyVersion)) {
      rejected += 1;
      continue;
    }

    const idem = ev.idempotency_key || `${sessionId}:${seq}:${ev.type}`;
    if (seenIdem.has(idem)) {
      duplicate += 1;
      continue;
    }
    seenIdem.add(idem);

    const mapped = mapLockdownEventToViolation(ev);
    if (!mapped) {
      rejected += 1;
      continue;
    }
    try {
      await query(
        `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at, source, review_status)
         VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6::timestamptz, now()),'lockdown','open')
         ON CONFLICT DO NOTHING`,
        [
          tenantId,
          sessionId,
          mapped.event_type,
          mapped.severity,
          JSON.stringify({ ...mapped.payload, idempotency_key: idem, lockdown: true }),
          ev.occurred_at || null,
        ]
      );
      accepted += 1;
    } catch {
      duplicate += 1;
    }
  }

  return { accepted, duplicate, rejected };
}
