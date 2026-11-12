import crypto from 'crypto';
import { query, pool } from '../../config/database.js';
import { config } from '../../config/index.js';

export const WEBHOOK_EVENT_TYPES = [
  'proctoring.session.created',
  'proctoring.session.started',
  'proctoring.session.disconnected',
  'proctoring.session.reconnected',
  'proctoring.violation.detected',
  'proctoring.session.completed',
  'proctoring.session.terminated',
  'proctoring.evidence.available',
  'proctoring.review.completed',
];

const MAX_ATTEMPTS = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || '6', 10);
const TIMEOUT_MS = parseInt(process.env.WEBHOOK_TIMEOUT_MS || '8000', 10);
const POLL_MS = parseInt(process.env.WEBHOOK_POLL_MS || '10000', 10);

/** Backoff schedule (seconds) for attempt N (1-based) after a failure. */
function backoffSeconds(attempt) {
  return Math.min(3600, 15 * 2 ** Math.max(0, attempt - 1));
}

export function signWebhookPayload(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function subscribes(events, eventType) {
  if (!Array.isArray(events) || !events.length) return true;
  return events.some((e) => e === '*' || e === eventType || (e.endsWith('.*') && eventType.startsWith(e.slice(0, -1))));
}

/**
 * Persist one delivery row per matching active webhook, then attempt delivery in the background.
 * Never throws: webhook problems must not affect the proctoring session that triggered them.
 */
export async function emitWebhookEvent(tenantId, eventType, data = {}) {
  try {
    const { rows: hooks } = await query(
      `SELECT id, events FROM webhooks WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );
    const targets = hooks.filter((h) => subscribes(h.events, eventType));
    if (!targets.length) return { queued: 0 };

    const eventId = crypto.randomUUID();
    const payload = {
      id: eventId,
      type: eventType,
      created_at: new Date().toISOString(),
      tenant_id: tenantId,
      data,
    };
    const ids = [];
    for (const h of targets) {
      const { rows } = await query(
        `INSERT INTO webhook_deliveries (tenant_id, webhook_id, event_id, event_type, session_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (webhook_id, event_id) DO NOTHING
         RETURNING id`,
        [tenantId, h.id, eventId, eventType, data.session_id || null, JSON.stringify(payload)]
      );
      if (rows[0]) ids.push(rows[0].id);
    }
    setImmediate(() => {
      for (const id of ids) void attemptDelivery(id);
    });
    return { queued: ids.length, event_id: eventId };
  } catch (e) {
    console.error('[webhooks] emit failed', eventType, e.message);
    return { queued: 0, error: e.message };
  }
}

/** Claim a delivery row (pending/failed and due) so only one worker sends it. */
async function claimDelivery(deliveryId) {
  const { rows } = await query(
    `UPDATE webhook_deliveries
     SET status = 'delivering', attempts = attempts + 1, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'failed') AND next_attempt_at <= now()
     RETURNING id, tenant_id, webhook_id, event_id, event_type, payload, attempts`,
    [deliveryId]
  );
  return rows[0] || null;
}

export async function attemptDelivery(deliveryId) {
  const claimed = await claimDelivery(deliveryId).catch(() => null);
  if (!claimed) return null;

  const { rows: hrows } = await query(
    `SELECT target_url, signing_secret, is_active FROM webhooks WHERE id = $1 AND tenant_id = $2`,
    [claimed.webhook_id, claimed.tenant_id]
  );
  const hook = hrows[0];
  if (!hook || !hook.is_active) {
    await query(
      `UPDATE webhook_deliveries SET status = 'dead', last_error = 'webhook disabled or removed', updated_at = now()
       WHERE id = $1`,
      [deliveryId]
    );
    return { status: 'dead' };
  }

  const body = JSON.stringify(claimed.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(hook.signing_secret, timestamp, body);
  const started = Date.now();
  let statusCode = null;
  let error = null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(hook.target_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ProctorShield-Webhooks/1.0',
          'X-ProctorShield-Event': claimed.event_type,
          'X-ProctorShield-Event-Id': claimed.event_id,
          'X-ProctorShield-Delivery': deliveryId,
          'X-ProctorShield-Timestamp': String(timestamp),
          'X-ProctorShield-Signature': `t=${timestamp},v1=${signature}`,
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      statusCode = res.status;
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    error = e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message || String(e);
  }
  const elapsed = Date.now() - started;

  if (!error) {
    await query(
      `UPDATE webhook_deliveries
       SET status = 'delivered', delivered_at = now(), last_status_code = $2, last_error = NULL,
           last_response_ms = $3, updated_at = now()
       WHERE id = $1`,
      [deliveryId, statusCode, elapsed]
    );
    return { status: 'delivered', status_code: statusCode };
  }

  const dead = claimed.attempts >= MAX_ATTEMPTS;
  await query(
    `UPDATE webhook_deliveries
     SET status = $2, last_status_code = $3, last_error = $4, last_response_ms = $5,
         next_attempt_at = now() + make_interval(secs => $6), updated_at = now()
     WHERE id = $1`,
    [deliveryId, dead ? 'dead' : 'failed', statusCode, String(error).slice(0, 500), elapsed, backoffSeconds(claimed.attempts)]
  );
  return { status: dead ? 'dead' : 'failed', error };
}

let timer = null;

/** Retry loop for due deliveries; also recovers rows stuck in 'delivering' after a crash. */
export function startWebhookWorker() {
  if (timer || process.env.WEBHOOKS_DISABLED === '1') return;
  const tick = async () => {
    try {
      await query(
        `UPDATE webhook_deliveries SET status = 'failed', updated_at = now()
         WHERE status = 'delivering' AND updated_at < now() - interval '2 minutes'`
      );
      const client = await pool.connect();
      let due = [];
      try {
        const { rows } = await client.query(
          `SELECT id FROM webhook_deliveries
           WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
           ORDER BY next_attempt_at ASC LIMIT 50`
        );
        due = rows;
      } finally {
        client.release();
      }
      for (const d of due) await attemptDelivery(d.id);
    } catch (e) {
      if (config.nodeEnv === 'development') console.warn('[webhooks] worker tick failed:', e.message);
    }
  };
  timer = setInterval(() => void tick(), POLL_MS);
  timer.unref?.();
}

export async function listWebhookDeliveries(tenantId, { webhook_id, session_id, status, limit = 50 } = {}) {
  const params = [tenantId];
  let where = 'WHERE d.tenant_id = $1';
  if (webhook_id) {
    params.push(webhook_id);
    where += ` AND d.webhook_id = $${params.length}::uuid`;
  }
  if (session_id) {
    params.push(session_id);
    where += ` AND d.session_id = $${params.length}::uuid`;
  }
  if (status) {
    params.push(status);
    where += ` AND d.status = $${params.length}`;
  }
  params.push(Math.min(200, Math.max(1, parseInt(limit, 10) || 50)));
  const { rows } = await query(
    `SELECT d.id, d.webhook_id, w.target_url, d.event_id, d.event_type, d.session_id, d.status, d.attempts,
            d.next_attempt_at, d.last_status_code, d.last_error, d.last_response_ms, d.delivered_at, d.created_at
     FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     ${where}
     ORDER BY d.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function redeliver(tenantId, deliveryId) {
  const { rows } = await query(
    `UPDATE webhook_deliveries
     SET status = 'pending', next_attempt_at = now(), updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND status IN ('failed', 'dead', 'delivered')
     RETURNING id`,
    [deliveryId, tenantId]
  );
  if (!rows[0]) return null;
  return attemptDelivery(rows[0].id);
}
