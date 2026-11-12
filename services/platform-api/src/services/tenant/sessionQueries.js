import { query } from '../../config/database.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';
import { violationSqlPredicate } from '../events/violationCatalog.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function sessionViolationStatsSql() {
  const vio = violationSqlPredicate('se');
  return `
    (SELECT count(*)::int FROM session_events se
      WHERE se.session_id = s.id AND ${vio} AND COALESCE(se.review_status, 'open') <> 'dismissed') AS violation_count,
    (SELECT count(*)::int FROM session_events se
      WHERE se.session_id = s.id AND ${vio} AND se.severity IN ('flag','critical') AND COALESCE(se.review_status, 'open') <> 'dismissed') AS high_severity_count,
    (SELECT count(*)::int FROM session_events se
      WHERE se.session_id = s.id AND ${vio} AND COALESCE(se.review_status, 'open') = 'open') AS open_violation_count,
    EXISTS (SELECT 1 FROM session_recording_chunks rc WHERE rc.session_id = s.id AND rc.file_path IS NOT NULL) AS has_recording,
    (SELECT count(*)::int FROM session_snapshots sn WHERE sn.session_id = s.id) AS snapshot_count,
    (SELECT sn.id FROM session_snapshots sn WHERE sn.session_id = s.id ORDER BY sn.captured_at DESC LIMIT 1) AS latest_snapshot_id
  `;
}

function sessionBaseColumnsSql({ slim }) {
  const heavy = slim
    ? ''
    : `,
    s.integration_metadata, s.sdk_init_meta, s.proctor_notes_json`;
  return `
    s.id, s.tenant_id, s.exam_id, s.candidate_id, s.status, s.created_at, s.updated_at, s.started_at, s.ended_at,
    s.stream_started_at, s.paused_at, s.external_ref, s.external_attempt_id, s.review_status, s.review_decision,
    s.reviewed_by, s.reviewed_at, s.review_summary, s.connection_state, s.last_heartbeat_at, s.violation_flags,
    s.access_link_id, s.extra_seconds${heavy},
    COALESCE(s.risk_score, 0) AS risk_score,
    s.highest_severity,
    COALESCE(NULLIF(trim(s.candidate_name), ''), c.name, NULLIF(trim(s.external_ref), ''), 'Unnamed candidate') AS candidate_name,
    c.email AS candidate_email,
    c.external_ref AS external_candidate_id,
    COALESCE(NULLIF(trim(e.title), ''), 'Untitled exam') AS exam_title,
    e.external_exam_id,
    CASE WHEN s.started_at IS NOT NULL
         THEN GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at)))::int
    END AS duration_seconds,
    ${sessionViolationStatsSql()}
  `;
}

/** List/live views: omits large JSON blobs (integration, SDK init, proctor notes). */
export function sessionSelectSlimSql() {
  return sessionBaseColumnsSql({ slim: true });
}

/** Session detail: includes integration_metadata, sdk_init_meta, proctor_notes_json. */
export function sessionSelectSql() {
  return sessionBaseColumnsSql({ slim: false });
}

export const SESSIONS_FROM_SQL = `FROM exam_sessions s
  LEFT JOIN exams e ON e.id = s.exam_id
  LEFT JOIN candidates c ON c.id = s.candidate_id`;

export function buildSessionFilters(tenantId, f) {
  const params = [tenantId];
  const where = ['s.tenant_id = $1'];
  if (f.exam_id) {
    params.push(f.exam_id);
    where.push(`s.exam_id = $${params.length}::uuid`);
  }
  if (f.status) {
    const list = String(f.status)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (list.length) {
      params.push(list);
      where.push(`s.status = ANY($${params.length}::text[])`);
    }
  }
  if (f.review_status) {
    params.push(String(f.review_status));
    where.push(`s.review_status = $${params.length}`);
  }
  if (f.review_decision) {
    params.push(String(f.review_decision));
    where.push(`s.review_decision = $${params.length}`);
  }
  if (f.highest_severity) {
    params.push(String(f.highest_severity).toUpperCase());
    where.push(`upper(COALESCE(s.highest_severity, '')) = $${params.length}`);
  }
  if (f.min_risk != null && f.min_risk !== '') {
    params.push(Number(f.min_risk));
    where.push(`COALESCE(s.risk_score, 0) >= $${params.length}`);
  }
  if (f.q) {
    params.push(`%${String(f.q).trim().toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(COALESCE(s.candidate_name, c.name, '')) LIKE $${i} OR lower(COALESCE(c.email, '')) LIKE $${i}
        OR lower(COALESCE(s.external_ref, '')) LIKE $${i} OR lower(COALESCE(e.title, '')) LIKE $${i}
        OR s.id::text LIKE $${i})`
    );
  }
  if (f.has_violations === 'true' || f.has_violations === true) {
    where.push(
      `EXISTS (SELECT 1 FROM session_events se WHERE se.session_id = s.id AND ${violationSqlPredicate('se')} AND COALESCE(se.review_status, 'open') <> 'dismissed')`
    );
  }
  if (f.violation_type) {
    params.push(`%${String(f.violation_type).trim().toLowerCase()}%`);
    const i = params.length;
    where.push(
      `EXISTS (SELECT 1 FROM session_events se WHERE se.session_id = s.id AND ${violationSqlPredicate('se')}
        AND lower(se.event_type) LIKE $${i} AND COALESCE(se.review_status, 'open') <> 'dismissed')`
    );
  }
  if (f.from) {
    params.push(f.from);
    where.push(`s.created_at >= $${params.length}::timestamptz`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`s.created_at <= $${params.length}::timestamptz`);
  }
  return { params, where };
}

export async function listSessionsEnriched(tenantId, filters = {}) {
  const limit = clampLimit(filters.limit);
  const { params, where } = buildSessionFilters(tenantId, filters);
  const countParams = [...params];
  const countWhere = [...where];
  const sortRisk = String(filters.sort || '') === 'risk';
  const c = decodeCursor(filters.cursor || filters.next_cursor);
  if (sortRisk) {
    if (c?.risk_score != null && c?.id) {
      params.push(Number(c.risk_score), c.id);
      where.push(`(COALESCE(s.risk_score,0), s.id) < ($${params.length - 1}::numeric, $${params.length}::uuid)`);
    }
  } else if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where.push(`(s.created_at, s.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(limit + 1);
  const order = sortRisk
    ? 'ORDER BY COALESCE(s.risk_score,0) DESC, s.id DESC'
    : 'ORDER BY s.created_at DESC, s.id DESC';
  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(
      `SELECT ${sessionSelectSlimSql()} ${SESSIONS_FROM_SQL}
       WHERE ${where.join(' AND ')}
       ${order}
       LIMIT $${params.length}`,
      params
    ),
    query(`SELECT count(*)::int AS total ${SESSIONS_FROM_SQL} WHERE ${countWhere.join(' AND ')}`, countParams),
  ]);
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  let next_cursor = null;
  if (hasMore && last) {
    next_cursor = sortRisk
      ? encodeCursor({ risk_score: Number(last.risk_score || 0), id: last.id })
      : encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  return {
    items: slice,
    total: countRows[0]?.total ?? slice.length,
    next_cursor,
  };
}

export async function getSessionEnriched(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT ${sessionSelectSql()} ${SESSIONS_FROM_SQL} WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, tenantId]
  );
  return rows[0] || null;
}

export async function listLiveSessionsEnriched(tenantId, { limit, exam_id } = {}) {
  const params = [tenantId];
  let where = `s.tenant_id = $1 AND s.status IN ('active', 'paused')`;
  if (exam_id) {
    params.push(exam_id);
    where += ` AND s.exam_id = $${params.length}::uuid`;
  }
  params.push(clampLimit(limit || 100));
  const { rows } = await query(
    `SELECT ${sessionSelectSlimSql()},
            (SELECT max(se.occurred_at) FROM session_events se WHERE se.session_id = s.id AND ${violationSqlPredicate('se')}) AS last_violation_at,
            (SELECT fc.match_score FROM session_face_checks fc WHERE fc.session_id = s.id AND fc.match_score IS NOT NULL
              ORDER BY fc.occurred_at DESC LIMIT 1) AS last_identity_score
     ${SESSIONS_FROM_SQL}
     WHERE ${where}
     ORDER BY COALESCE(s.started_at, s.created_at) DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function tenantOverview(tenantId) {
  const vio = violationSqlPredicate('se');
  const [{ rows: totals }, { rows: daily }, { rows: topViolations }, { rows: exams }] = await Promise.all([
    query(
      `SELECT
         count(*)::int AS total_sessions,
         count(*) FILTER (WHERE status IN ('active','paused'))::int AS live_sessions,
         count(*) FILTER (WHERE status = 'scheduled')::int AS pending_sessions,
         count(*) FILTER (WHERE status = 'completed')::int AS completed_sessions,
         count(*) FILTER (WHERE status IN ('terminated','failed'))::int AS ended_abnormally,
         count(*) FILTER (WHERE COALESCE(review_status,'pending') <> 'reviewed' AND status IN ('completed','terminated','failed'))::int AS awaiting_review,
         count(*) FILTER (WHERE review_decision = 'flagged')::int AS flagged_sessions,
         count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS sessions_last_7d,
         (SELECT count(*)::int FROM exams WHERE tenant_id = $1) AS exam_contexts,
         (SELECT count(*)::int FROM candidates WHERE tenant_id = $1) AS candidates
       FROM exam_sessions WHERE tenant_id = $1`,
      [tenantId]
    ),
    query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM exam_sessions s WHERE s.tenant_id = $1 AND s.created_at >= d AND s.created_at < d + interval '1 day') AS sessions,
              (SELECT count(*)::int FROM session_events se WHERE se.tenant_id = $1 AND ${vio}
                 AND se.occurred_at >= d AND se.occurred_at < d + interval '1 day') AS violations
       FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
       ORDER BY d`,
      [tenantId]
    ),
    query(
      `SELECT regexp_replace(regexp_replace(se.event_type, '^(violation\\.|ai\\.)', ''), '^ai_', '') AS code,
              count(*)::int AS count
       FROM session_events se
       WHERE se.tenant_id = $1 AND ${vio} AND se.occurred_at >= now() - interval '30 days'
       GROUP BY 1 ORDER BY count DESC LIMIT 10`,
      [tenantId]
    ),
    query(
      `SELECT e.id, e.title, e.external_exam_id,
              count(s.id)::int AS sessions,
              count(s.id) FILTER (WHERE s.status IN ('active','paused'))::int AS live,
              max(s.created_at) AS last_session_at
       FROM exams e
       LEFT JOIN exam_sessions s ON s.exam_id = e.id
       WHERE e.tenant_id = $1
       GROUP BY e.id
       ORDER BY max(s.created_at) DESC NULLS LAST
       LIMIT 8`,
      [tenantId]
    ),
  ]);
  return {
    totals: totals[0] || {},
    daily,
    top_violations: topViolations,
    recent_exams: exams,
  };
}
