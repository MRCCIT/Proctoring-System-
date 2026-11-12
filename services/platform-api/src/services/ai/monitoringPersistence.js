import { query } from '../../config/database.js';
import { assertSessionForTenant } from '../sdk/candidateSessions.js';
import { insertSnapshotEvidence, stripDataUrl } from '../tenant/recording.js';
import { describeEvent, shouldRecordAiEvent } from '../events/violationCatalog.js';
import { emitWebhookEvent } from '../webhooks/dispatcher.js';

function mapViolationToEvent(v) {
  const severity = v.includes('phone') ? 'flag' : 'warn';
  return { event_type: `ai.${v}`, severity, payload: { source: 'analyzer' } };
}

export async function persistAnalyzerEvents(tenantId, sessionId, analysis) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) return { persisted: 0 };
  let count = 0;
  const violations = analysis.violations || [];
  for (const v of violations) {
    const ev = mapViolationToEvent(v);
    await query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
      [tenantId, sessionId, ev.event_type, ev.severity, JSON.stringify(ev.payload)]
    );
    count += 1;
  }
  if (analysis.gaze_direction && analysis.gaze_direction !== 'center') {
    await query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
      [
        tenantId,
        sessionId,
        'ai.gaze_off_center',
        'warn',
        JSON.stringify({ direction: analysis.gaze_direction, score: analysis.gaze_score, detector: analysis.gaze_detector }),
      ]
    );
    count += 1;
  }
  return { persisted: count };
}

const lastEventAt = new Map();

function shouldEmit(sessionId, violationKey, cooldownMs = 8000) {
  const k = `${sessionId}:${violationKey}`;
  const now = Date.now();
  const last = lastEventAt.get(k) || 0;
  if (now - last < cooldownMs) return false;
  lastEventAt.set(k, now);
  return true;
}

export async function persistUnifiedProctorTick(tenantId, sessionId, analysis, imageDataUrl = null, options = {}) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) return { events: 0, face_check: false };

  let events = 0;
  const violations = analysis.violations || [];
  const shouldLogFace = violations.length > 0 || Boolean(options.alwaysLogFace);

  for (const v of violations) {
    if (!shouldEmit(sessionId, v)) continue;
    const ev = mapViolationToEvent(v);
    if (!shouldRecordAiEvent(sessionId, ev.event_type)) continue;
    const meta = describeEvent(ev.event_type, ev.severity);
    const { rows: ins } = await query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at, source)
       VALUES ($1, $2, $3, $4, $5::jsonb, now(), 'ai')
       RETURNING id, occurred_at`,
      [
        tenantId,
        sessionId,
        ev.event_type,
        meta.severity,
        JSON.stringify({
          source: 'unified_tick',
          gaze_direction: analysis.gaze_direction,
          gaze_score: analysis.gaze_score,
          phone_detected: analysis.phone_detected,
          identity_score: analysis.identity_score ?? null,
          face_count: analysis.face_count ?? null,
        }),
      ]
    );
    events += 1;
    void emitWebhookEvent(tenantId, 'proctoring.violation.detected', {
      session_id: sessionId,
      event_id: String(ins[0].id),
      code: meta.code,
      label: meta.label,
      category: meta.category,
      severity: meta.severity,
      source: 'ai',
      occurred_at: ins[0].occurred_at,
    });
  }

  const violsForFace = violations.filter((x) => typeof x === 'string');

  if (shouldLogFace) {
    await query(
      `INSERT INTO session_face_checks
        (tenant_id, session_id, face_count, match_score, gaze_direction, gaze_score, sideways_score, detector, violations, occurred_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], now(), 'server_ai')`,
      [
        tenantId,
        sessionId,
        Number(analysis.face_count) || 0,
        analysis.identity_score != null ? Number(analysis.identity_score) : null,
        analysis.gaze_direction || null,
        analysis.gaze_score != null ? Number(analysis.gaze_score) : null,
        analysis.sideways_score != null ? Number(analysis.sideways_score) : null,
        analysis.gaze_detector || 'unified',
        violsForFace,
      ]
    );
  }

  if (violsForFace.length) {
    await query(
      `UPDATE exam_sessions SET violation_flags = violation_flags + $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [violsForFace.length, sessionId, tenantId]
    );
  }

  // If we have an image data URL and face/ai violations, persist a snapshot for proctors
  try {
    if (imageDataUrl && violsForFace.length) {
      const image_base64 = stripDataUrl(imageDataUrl);
      const electronics_labels = Array.isArray(analysis.electronics_labels) ? analysis.electronics_labels : [];
      await insertSnapshotEvidence(tenantId, sessionId, {
        image_base64,
        caption: `AI violation: ${violsForFace.join(',')}` + (electronics_labels.length ? ` · labels: ${electronics_labels.join(',')}` : ''),
        label: 'ai_violation',
        violation_context: { violations: violsForFace, gaze: analysis.gaze_direction, electronics: electronics_labels },
        mime_type: 'image/jpeg',
        source: 'server_ai',
      });
    }
  } catch (e) {
    /* non-fatal if snapshot persistence fails */
    console.error('[persistUnifiedProctorTick] snapshot persist failed', e && e.message ? e.message : e);
  }

  return { events, face_check: shouldLogFace };
}

export async function persistPhoneEvent(tenantId, sessionId, phoneDetected) {
  if (!phoneDetected) return { persisted: 0 };
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) return { persisted: 0 };
  await query(
    `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
     VALUES ($1, $2, 'ai.phone_detected', 'flag', $3::jsonb, now())`,
    [tenantId, sessionId, JSON.stringify({ source: 'yolo_or_heuristic' })]
  );
  return { persisted: 1 };
}
