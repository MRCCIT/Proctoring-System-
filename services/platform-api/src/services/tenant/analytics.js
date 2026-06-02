import { query } from '../../config/database.js';

export async function getTenantUsageAnalytics(tenantId) {
  const { rows: s } = await query(
    `SELECT
       COUNT(*)::int AS total_sessions,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_sessions,
       COALESCE(SUM(storage_bytes), 0)::bigint AS storage_bytes,
       COALESCE(SUM(bytes_egress), 0)::bigint AS bytes_egress,
       COALESCE(SUM(violation_flags), 0)::bigint AS violation_flags
     FROM exam_sessions WHERE tenant_id = $1`,
    [tenantId]
  );
  const { rows: e } = await query(`SELECT COUNT(*)::int AS exams FROM exams WHERE tenant_id = $1`, [tenantId]);
  const { rows: c } = await query(`SELECT COUNT(*)::int AS candidates FROM candidates WHERE tenant_id = $1`, [tenantId]);
  const { rows: daily } = await query(
    `SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS sessions
     FROM exam_sessions
     WHERE tenant_id = $1 AND created_at > now() - interval '30 days'
     GROUP BY 1 ORDER BY 1 ASC`,
    [tenantId]
  );
  return {
    totals: {
      exams: e[0].exams,
      candidates: c[0].candidates,
      total_sessions: s[0].total_sessions,
      active_sessions: s[0].active_sessions,
      storage_bytes: String(s[0].storage_bytes),
      bytes_egress: String(s[0].bytes_egress),
      violation_flags: String(s[0].violation_flags),
    },
    sessions_per_day: daily.map((d) => ({ day: d.day, sessions: d.sessions })),
  };
}

export async function getTenantViolationsAnalytics(tenantId) {
  const { rows: byDay } = await query(
    `SELECT date_trunc('day', occurred_at) AS day,
            COUNT(*)::int AS events,
            COUNT(*) FILTER (WHERE severity IN ('flag','terminate'))::int AS serious
     FROM session_events
     WHERE tenant_id = $1 AND occurred_at > now() - interval '30 days'
     GROUP BY 1 ORDER BY 1 ASC`,
    [tenantId]
  );
  const { rows: byType } = await query(
    `SELECT event_type, COUNT(*)::int AS count
     FROM session_events
     WHERE tenant_id = $1 AND occurred_at > now() - interval '90 days'
     GROUP BY 1 ORDER BY count DESC LIMIT 25`,
    [tenantId]
  );
  return {
    events_per_day: byDay.map((r) => ({
      day: r.day,
      events: r.events,
      serious: r.serious,
    })),
    top_event_types: byType,
  };
}
