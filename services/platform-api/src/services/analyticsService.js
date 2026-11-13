import { query } from '../config/database.js';
import { livePresenceSql } from './sessions/livePresence.js';

export async function getPlatformAnalytics() {
  const { rows: totalsRows } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM tenants WHERE status = 'active') AS active_tenants,
        (SELECT COUNT(*)::int FROM tenants) AS total_tenants,
        (SELECT COUNT(*)::int FROM exam_sessions WHERE ${livePresenceSql('')}) AS active_sessions,
        (SELECT COUNT(*)::int FROM exam_sessions) AS total_sessions,
        (SELECT COALESCE(SUM(storage_bytes), 0)::bigint FROM exam_sessions) AS total_storage_bytes,
        (SELECT COALESCE(SUM(bytes_egress), 0)::bigint FROM exam_sessions) AS total_egress_bytes,
        (SELECT COALESCE(SUM(violation_flags), 0)::bigint FROM exam_sessions) AS total_violation_flags
    `);
  const totals = totalsRows;

  const { rows: daily } = await query(`
    SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS sessions_started
    FROM exam_sessions
    WHERE created_at > now() - interval '30 days'
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return {
    summary: {
      active_tenants: totals[0].active_tenants,
      total_tenants: totals[0].total_tenants,
      active_sessions: totals[0].active_sessions,
      total_sessions: totals[0].total_sessions,
      total_storage_bytes: String(totals[0].total_storage_bytes),
      total_egress_bytes: String(totals[0].total_egress_bytes),
      total_violation_flags: String(totals[0].total_violation_flags),
    },
    sessions_per_day: daily.map((r) => ({
      day: r.day,
      sessions_started: r.sessions_started,
    })),
  };
}

export async function getTenantsCompare() {
  const { rows } = await query(`
    SELECT
      t.id,
      t.name,
      t.slug,
      t.status,
      COUNT(s.id)::int AS total_sessions,
      COUNT(s.id) FILTER (WHERE ${livePresenceSql('s')})::int AS active_sessions,
      COALESCE(SUM(s.violation_flags), 0)::bigint AS violation_flags_sum,
      COUNT(s.id) FILTER (WHERE s.review_decision = 'flagged')::int AS flagged_sessions,
      COUNT(s.id) FILTER (
        WHERE COALESCE(s.review_status, 'pending') <> 'reviewed'
          AND s.status IN ('completed','terminated','failed')
      )::int AS awaiting_review,
      COALESCE(AVG(CASE WHEN s.success IS TRUE THEN 1.0 WHEN s.success IS FALSE THEN 0.0 END), NULL)::float AS success_rate,
      COALESCE(SUM(s.storage_bytes), 0)::bigint AS storage_bytes
    FROM tenants t
    LEFT JOIN exam_sessions s ON s.tenant_id = t.id
    GROUP BY t.id
    ORDER BY total_sessions DESC
  `);
  return rows.map((r) => ({
    tenant_id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    total_sessions: Number(r.total_sessions || 0),
    active_sessions: Number(r.active_sessions || 0),
    violation_flags_sum: String(r.violation_flags_sum ?? 0),
    flagged_sessions: Number(r.flagged_sessions || 0),
    awaiting_review: Number(r.awaiting_review || 0),
    success_rate: r.success_rate == null ? null : Number(r.success_rate),
    storage_bytes: String(r.storage_bytes ?? 0),
  }));
}
