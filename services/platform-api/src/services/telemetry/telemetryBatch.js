import { query } from '../../config/database.js';
import { assertSessionForTenant } from '../sdk/candidateSessions.js';

function mapFaceViolationToSessionEvent(v) {
  const key = String(v || '').trim();
  if (key === 'no_face_detected') return { event_type: 'ai.no_face_in_frame', severity: 'warn' };
  if (key === 'multiple_faces_detected') return { event_type: 'ai.multiple_faces', severity: 'flag' };
  if (key === 'identity_mismatch') return { event_type: 'ai.identity_mismatch', severity: 'flag' };
  return { event_type: `ai.${key.replace(/[^a-z0-9_]/gi, '_')}`, severity: 'warn' };
}

export async function batchInsertFaceChecks(tenantId, sessionId, items) {
  const row = await assertSessionForTenant(tenantId, sessionId);
  if (!row) return { inserted_count: 0, session_events_added: 0 };

  let inserted = 0;
  let eventAdds = 0;

  for (const it of items) {
    const occurred_at = it.occurred_at ? new Date(it.occurred_at) : new Date();
    const fc = Number.isFinite(Number(it.face_count)) ? Number(it.face_count) : 0;
    const viols = Array.isArray(it.violations) ? it.violations : [];

    await query(
      `INSERT INTO session_face_checks
        (tenant_id, session_id, face_count, match_score, gaze_direction, gaze_score, sideways_score, detector, violations, occurred_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::timestamptz, $11)`,
      [
        tenantId,
        sessionId,
        fc,
        it.match_score != null ? Number(it.match_score) : null,
        it.gaze_direction || null,
        it.gaze_score != null ? Number(it.gaze_score) : null,
        it.sideways_score != null ? Number(it.sideways_score) : null,
        it.detector || 'wasm',
        viols,
        occurred_at.toISOString(),
        it.source || 'local_worker',
      ]
    );
    inserted += 1;

    for (const v of viols) {
      const mapped = mapFaceViolationToSessionEvent(v);
      await query(
        `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
        [
          tenantId,
          sessionId,
          mapped.event_type,
          mapped.severity,
          JSON.stringify({ source: it.source || 'face_check', face_count: fc, detector: it.detector }),
          occurred_at.toISOString(),
        ]
      );
      eventAdds += 1;
    }

    if (viols.length) {
      await query(
        `UPDATE exam_sessions SET violation_flags = violation_flags + $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [viols.length, sessionId, tenantId]
      );
    }
  }

  return { inserted_count: inserted, session_events_added: eventAdds };
}

export async function processTelemetryJob(job) {
  const { type, tenantId, sessionId, payload } = job.data;
  if (type === 'face_checks') {
    return batchInsertFaceChecks(tenantId, sessionId, payload.items || []);
  }
  if (type === 'unified_tick') {
    const { persistUnifiedProctorTick } = await import('../ai/monitoringPersistence.js');
    return persistUnifiedProctorTick(tenantId, sessionId, payload.analysis);
  }
  return { skipped: true };
}
