import { pool, query } from '../../config/database.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Backfill candidates from exam sessions that never got a candidates row
 * (older SDK starts). Safe to call on every list.
 */
export async function syncCandidatesFromSessions(tenantId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Link sessions that already match an existing external_ref
    await client.query(
      `UPDATE exam_sessions s
          SET candidate_id = c.id,
              updated_at = now()
         FROM candidates c
        WHERE s.tenant_id = $1
          AND s.candidate_id IS NULL
          AND c.tenant_id = s.tenant_id
          AND s.external_ref IS NOT NULL
          AND trim(s.external_ref) <> ''
          AND lower(trim(c.external_ref)) = lower(trim(s.external_ref))`,
      [tenantId]
    );

    // Create candidates for remaining orphan sessions (one row per external_ref / name)
    const { rows: orphans } = await client.query(
      `SELECT DISTINCT ON (COALESCE(NULLIF(lower(trim(external_ref)), ''), id::text))
              id AS session_id,
              external_ref,
              candidate_name
         FROM exam_sessions
        WHERE tenant_id = $1
          AND candidate_id IS NULL
          AND (
            (external_ref IS NOT NULL AND trim(external_ref) <> '')
            OR (candidate_name IS NOT NULL AND trim(candidate_name) <> '')
          )
        ORDER BY COALESCE(NULLIF(lower(trim(external_ref)), ''), id::text), created_at ASC`,
      [tenantId]
    );

    for (const row of orphans) {
      const ref =
        row.external_ref && String(row.external_ref).trim()
          ? String(row.external_ref).trim()
          : `session:${row.session_id}`;
      const name =
        row.candidate_name && String(row.candidate_name).trim()
          ? String(row.candidate_name).trim()
          : ref;
      const { rows: created } = await client.query(
        `INSERT INTO candidates (tenant_id, email, name, external_ref)
         VALUES ($1, NULL, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [tenantId, name, ref]
      );
      let candidateId = created[0]?.id;
      if (!candidateId) {
        const found = await client.query(
          `SELECT id FROM candidates
            WHERE tenant_id = $1 AND lower(trim(external_ref)) = lower(trim($2))
            LIMIT 1`,
          [tenantId, ref]
        );
        candidateId = found.rows[0]?.id;
      }
      if (!candidateId) continue;
      await client.query(
        `UPDATE exam_sessions
            SET candidate_id = $1, updated_at = now()
          WHERE tenant_id = $2
            AND candidate_id IS NULL
            AND (
              (external_ref IS NOT NULL AND lower(trim(external_ref)) = lower(trim($3)))
              OR id = $4
            )`,
        [candidateId, tenantId, ref, row.session_id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // Listing should still work even if sync fails
    console.warn('[candidates] syncFromSessions failed:', e.message);
  } finally {
    client.release();
  }
}

export async function listCandidates(tenantId, { cursor, limit: rawLimit }) {
  await syncCandidatesFromSessions(tenantId);

  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId];
  let where = 'WHERE c.tenant_id = $1';
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where += ` AND (c.created_at, c.id) < ($2::timestamptz, $3::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT c.id, c.email, c.name, c.external_ref, c.created_at, c.updated_at,
            COALESCE(s.sessions_count, 0)::int AS sessions_count,
            s.last_session_at,
            s.last_exam_title
       FROM candidates c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS sessions_count,
                MAX(es.created_at) AS last_session_at,
                (
                  SELECT e.title
                    FROM exam_sessions es2
                    LEFT JOIN exams e ON e.id = es2.exam_id
                   WHERE es2.tenant_id = c.tenant_id AND es2.candidate_id = c.id
                   ORDER BY es2.created_at DESC
                   LIMIT 1
                ) AS last_exam_title
           FROM exam_sessions es
          WHERE es.tenant_id = c.tenant_id AND es.candidate_id = c.id
       ) s ON true
      ${where}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${limIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  return { items: slice, next_cursor };
}
