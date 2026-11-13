import { query } from '../../config/database.js';
import { canonicalCode, describeEvent, violationSqlPredicate } from '../events/violationCatalog.js';
import { livePresenceSql } from '../sessions/livePresence.js';

export async function getTenantUsageAnalytics(tenantId) {
  const { rows: s } = await query(
    `SELECT
       COUNT(*)::int AS total_sessions,
       COUNT(*) FILTER (WHERE ${livePresenceSql('')})::int AS active_sessions,
       COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS sessions_last_7d,
       COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS sessions_last_30d,
       COALESCE(SUM(storage_bytes), 0)::bigint AS storage_bytes,
       COALESCE(SUM(bytes_egress), 0)::bigint AS bytes_egress,
       COALESCE(SUM(violation_flags), 0)::bigint AS violation_flags
     FROM exam_sessions WHERE tenant_id = $1`,
    [tenantId]
  );
  const { rows: e } = await query(`SELECT COUNT(*)::int AS exams FROM exams WHERE tenant_id = $1`, [tenantId]);
  const { rows: c } = await query(`SELECT COUNT(*)::int AS candidates FROM candidates WHERE tenant_id = $1`, [tenantId]);
  const { rows: reviewed } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE review_decision = 'flagged')::int AS flagged,
       COUNT(*) FILTER (WHERE review_decision = 'cleared')::int AS cleared,
       COUNT(*) FILTER (WHERE review_status = 'pending' AND status IN ('completed','terminated','failed'))::int AS awaiting_review
     FROM exam_sessions WHERE tenant_id = $1`,
    [tenantId]
  );
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
      sessions_last_7d: s[0].sessions_last_7d,
      sessions_last_30d: s[0].sessions_last_30d,
      storage_bytes: String(s[0].storage_bytes),
      bytes_egress: String(s[0].bytes_egress),
      violation_flags: String(s[0].violation_flags),
      flagged_sessions: reviewed[0].flagged,
      cleared_sessions: reviewed[0].cleared,
      awaiting_review: reviewed[0].awaiting_review,
    },
    sessions_per_day: daily.map((d) => ({ day: d.day, sessions: d.sessions })),
  };
}

export async function getTenantViolationsAnalytics(tenantId) {
  const pred = violationSqlPredicate('se');
  const { rows: byDay } = await query(
    `SELECT date_trunc('day', se.occurred_at) AS day,
            COUNT(*)::int AS events,
            COUNT(*) FILTER (WHERE se.severity IN ('flag','critical','terminate'))::int AS serious
     FROM session_events se
     WHERE se.tenant_id = $1
       AND se.occurred_at > now() - interval '30 days'
       AND ${pred}
     GROUP BY 1 ORDER BY 1 ASC`,
    [tenantId]
  );
  const { rows: byType } = await query(
    `SELECT se.event_type, COUNT(*)::int AS count
     FROM session_events se
     WHERE se.tenant_id = $1
       AND se.occurred_at > now() - interval '90 days'
       AND ${pred}
     GROUP BY 1 ORDER BY count DESC LIMIT 50`,
    [tenantId]
  );

  const grouped = new Map();
  for (const row of byType) {
    const d = describeEvent(row.event_type, null);
    const prev = grouped.get(d.code) || { code: d.code, label: d.label, category: d.category, severity: d.severity, count: 0 };
    prev.count += row.count;
    grouped.set(d.code, prev);
  }
  const top = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 15);

  return {
    events_per_day: byDay.map((r) => ({
      day: r.day,
      events: r.events,
      serious: r.serious,
    })),
    top_event_types: top.map((t) => ({
      event_type: t.code,
      code: t.code,
      label: t.label,
      category: t.category,
      severity: t.severity,
      count: t.count,
    })),
  };
}
