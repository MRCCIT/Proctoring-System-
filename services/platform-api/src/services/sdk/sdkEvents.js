import { query } from '../../config/database.js';
import { assertSessionForTenant } from './candidateSessions.js';
import { laneDecision } from '../queue/lanes.js';
import { getTenantLoadLevel } from '../capacity/loadLevelStore.js';

export async function insertSdkEventsBatch(tenantId, sessionId, eventsInput) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }
  const events = Array.isArray(eventsInput) ? eventsInput : [];
  if (!events.length) {
    const e = new Error('events array is required');
    e.status = 422;
    throw e;
  }
  const inserted = [];
  for (const ev of events) {
    const event_type = String(ev.type || ev.event_type || '').trim();
    if (!event_type) continue;
    const severity = String(ev.severity || 'info');
    const payload = ev.payload && typeof ev.payload === 'object' ? ev.payload : { value: ev.payload };
    const occurred_at = ev.occurred_at ? new Date(ev.occurred_at) : new Date();
    const { rows } = await query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
       RETURNING id, event_type, severity, occurred_at`,
      [tenantId, sessionId, event_type, severity, JSON.stringify(payload), occurred_at.toISOString()]
    );
    inserted.push(rows[0]);
  }
  if (!inserted.length) {
    const e = new Error('No valid events to insert');
    e.status = 422;
    throw e;
  }
  return { inserted_count: inserted.length, events: inserted };
}

/**
 * POST /sdk/events may send a single session_id with batch of events, or per-event session ids.
 * Supported shapes:
 * - { session_id, events: [...] }
 * - { events: [ { session_id, type, ...}, ... ] }
 */
export async function ingestSdkEvents(tenantId, body) {
  const decision = laneDecision('violation.ingest', { loadLevel: getTenantLoadLevel(tenantId) });
  if (!decision.allow) {
    const e = new Error(`Violation ingest deferred (${decision.lane} at ${getTenantLoadLevel(tenantId)})`);
    e.status = 503;
    throw e;
  }
  if (body.session_id && Array.isArray(body.events)) {
    return insertSdkEventsBatch(tenantId, body.session_id, body.events);
  }
  if (Array.isArray(body.events) && body.events.length && body.events[0]?.session_id) {
    const grouped = new Map();
    for (const ev of body.events) {
      const sid = ev.session_id;
      if (!sid) continue;
      if (!grouped.has(sid)) grouped.set(sid, []);
      grouped.get(sid).push(ev);
    }
    const out = [];
    for (const [sid, list] of grouped.entries()) {
      out.push({ session_id: sid, ...(await insertSdkEventsBatch(tenantId, sid, list)) });
    }
    return { batches: out };
  }
  const e = new Error('Provide { session_id, events: [] } or { events: [{ session_id, ...}] }');
  e.status = 422;
  throw e;
}
