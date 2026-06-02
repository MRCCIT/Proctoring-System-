import { query } from '../../config/database.js';
import { readFileSafe } from '../../storage/localStorage.js';

/**
 * Returns the enrolled reference photo for the candidate attached to a session.
 * Resolution order:
 *   1. candidate.reference_photo_key (file on disk under STORAGE_DIR)
 *   2. external_ref-based lookup: candidate with external_ref or email starting with "savej"
 * Falls back to null when no reference is enrolled.
 */
export async function getSessionIdentityReference(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT c.id          AS candidate_id,
            c.email,
            c.name,
            c.external_ref,
            c.reference_photo_key,
            c.reference_photo_mime,
            s.external_ref AS session_external_ref
       FROM exam_sessions s
       LEFT JOIN candidates c ON c.id = s.candidate_id
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, tenantId]
  );
  const row = rows[0];
  if (!row) {
    const e = new Error('Session not found');
    e.status = 404;
    throw e;
  }

  let candidate = row.candidate_id ? row : null;
  let key = candidate?.reference_photo_key || null;
  let mime = candidate?.reference_photo_mime || 'image/jpeg';

  // External-ref fallback: lets the candidate app pass e.g. external_ref="savej"
  // when no candidate row was attached at init.
  if (!key) {
    const ref = (row.session_external_ref || '').toLowerCase();
    if (ref) {
      const fb = await query(
        `SELECT id, email, name, external_ref, reference_photo_key, reference_photo_mime
           FROM candidates
          WHERE tenant_id = $1
            AND reference_photo_key IS NOT NULL
            AND (lower(external_ref) = $2 OR lower(email) LIKE $3 OR lower(name) LIKE $3)
          ORDER BY created_at ASC
          LIMIT 1`,
        [tenantId, ref, `%${ref}%`]
      );
      if (fb.rows[0]) {
        candidate = {
          candidate_id: fb.rows[0].id,
          email: fb.rows[0].email,
          name: fb.rows[0].name,
          external_ref: fb.rows[0].external_ref,
        };
        key = fb.rows[0].reference_photo_key;
        mime = fb.rows[0].reference_photo_mime || 'image/jpeg';
      }
    }
  }

  if (!key) {
    return {
      candidate: candidate
        ? { id: candidate.candidate_id, email: candidate.email, name: candidate.name, external_ref: candidate.external_ref }
        : null,
      enrolled: false,
      data_url: null,
    };
  }

  const buf = readFileSafe(key);
  if (!buf) {
    return {
      candidate: { id: candidate.candidate_id, email: candidate.email, name: candidate.name, external_ref: candidate.external_ref },
      enrolled: false,
      data_url: null,
      reason: 'reference file missing on disk',
    };
  }
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  return {
    candidate: {
      id: candidate.candidate_id,
      email: candidate.email,
      name: candidate.name,
      external_ref: candidate.external_ref,
    },
    enrolled: true,
    mime_type: mime,
    bytes: buf.length,
    data_url: dataUrl,
  };
}
