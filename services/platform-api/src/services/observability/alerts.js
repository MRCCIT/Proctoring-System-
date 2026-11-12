import { query } from '../../config/database.js';
import { getRecentCounters } from './aggregator.js';
import { getWsStats } from '../../ws/wsStats.js';
import { getLaneStats } from '../queue/laneStats.js';
import { getGlobalPolicies } from './policies.js';

async function upsertAlert({ severity, service_name, title, message, trigger_metric, trigger_value, threshold_value, tenant_id, details }) {
  try {
    const { rows: existing } = await query(
      `SELECT id FROM monitoring_alerts
        WHERE status IN ('open','acknowledged')
          AND title = $1
          AND COALESCE(service_name,'') = COALESCE($2,'')
          AND COALESCE(tenant_id::text,'') = COALESCE($3::text,'')
        LIMIT 1`,
      [title, service_name || null, tenant_id || null]
    );
    if (existing[0]) {
      await query(
        `UPDATE monitoring_alerts SET trigger_value = $2, updated_at = now(), details = $3::jsonb WHERE id = $1`,
        [existing[0].id, trigger_value ?? null, JSON.stringify(details || {})]
      );
      return existing[0].id;
    }
    const { rows } = await query(
      `INSERT INTO monitoring_alerts
        (severity, service_name, tenant_id, title, message, trigger_metric, trigger_value, threshold_value, details)
       VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [
        severity,
        service_name || null,
        tenant_id || null,
        title,
        message || null,
        trigger_metric || null,
        trigger_value ?? null,
        threshold_value ?? null,
        JSON.stringify(details || {}),
      ]
    );
    return rows[0].id;
  } catch {
    return null;
  }
}

export async function evaluateAlerts({ live = [], hardware = null } = {}) {
  const policies = await getGlobalPolicies();
  const p = policies.policies || {};

  for (const s of live) {
    if (s.status === 'unhealthy') {
      await upsertAlert({
        severity: 'critical',
        service_name: s.name,
        title: `${s.name} unhealthy`,
        message: s.details?.error || 'Service probe failed',
        trigger_metric: 'status',
        trigger_value: 0,
        threshold_value: 1,
        details: s.details,
      });
    }
  }

  const lat = getRecentCounters('platform_api', 'request_duration', 60_000).avg;
  if (lat > 800) {
    await upsertAlert({
      severity: lat > 1500 ? 'critical' : 'high',
      service_name: 'platform_api',
      title: 'API latency elevated',
      message: `p-ish avg latency ${Math.round(lat)}ms in last minute`,
      trigger_metric: 'request_duration',
      trigger_value: lat,
      threshold_value: 800,
    });
  }

  const ws = getWsStats();
  const maxWs = Number(p.max_websocket_connections || 10000);
  if (ws.active_connections > maxWs * 0.9) {
    await upsertAlert({
      severity: 'high',
      service_name: 'websocket',
      title: 'WebSocket near capacity',
      trigger_metric: 'active_connections',
      trigger_value: ws.active_connections,
      threshold_value: maxWs * 0.9,
    });
  }

  const lanes = getLaneStats();
  const p0Deferred = lanes.lanes?.P0?.deferred || 0;
  if (p0Deferred > 0) {
    await upsertAlert({
      severity: 'critical',
      service_name: 'queue',
      title: 'P0 lane deferred',
      message: 'Critical heartbeats/session ops were deferred — investigate immediately',
      trigger_metric: 'P0.deferred',
      trigger_value: p0Deferred,
      threshold_value: 0,
    });
  }

  if (hardware?.cpu_pct != null && hardware.cpu_pct > 90) {
    await upsertAlert({
      severity: 'high',
      service_name: 'hardware',
      title: 'CPU saturation',
      trigger_metric: 'cpu_pct',
      trigger_value: hardware.cpu_pct,
      threshold_value: 90,
    });
  }
  if (hardware?.ram_pct != null && hardware.ram_pct > 90) {
    await upsertAlert({
      severity: 'high',
      service_name: 'hardware',
      title: 'RAM pressure',
      trigger_metric: 'ram_pct',
      trigger_value: hardware.ram_pct,
      threshold_value: 90,
    });
  }

  // Tenant concurrency pressure
  try {
    const { rows } = await query(
      `SELECT t.id, t.name, t.quotas,
              (SELECT COUNT(*)::int FROM exam_sessions s WHERE s.tenant_id = t.id AND s.status IN ('active','paused')) AS live
         FROM tenants t WHERE t.status = 'active'`
    );
    for (const r of rows) {
      const max = Number(r.quotas?.max_concurrent_sessions || 100);
      if (max > 0 && r.live >= max * 0.9) {
        await upsertAlert({
          severity: r.live >= max ? 'critical' : 'medium',
          service_name: 'admission',
          tenant_id: r.id,
          title: `Tenant concurrency high: ${r.name}`,
          trigger_metric: 'live_sessions',
          trigger_value: r.live,
          threshold_value: max * 0.9,
        });
      }
    }
  } catch {
    /* ignore */
  }
}

export async function listAlerts({ status, severity, limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const params = [];
  let where = 'WHERE 1=1';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (severity) {
    params.push(severity);
    where += ` AND severity = $${params.length}`;
  }
  params.push(lim);
  try {
    const { rows } = await query(
      `SELECT a.*, t.name AS tenant_name, t.slug AS tenant_slug
         FROM monitoring_alerts a
         LEFT JOIN tenants t ON t.id = a.tenant_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${params.length}`,
      params
    );
    return rows;
  } catch {
    return [];
  }
}

export async function acknowledgeAlert(id, { actor } = {}) {
  const { rows } = await query(
    `UPDATE monitoring_alerts
        SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now(), updated_at = now()
      WHERE id = $1::uuid AND status = 'open'
      RETURNING *`,
    [id, actor || 'superadmin']
  );
  return rows[0] || null;
}

export async function resolveAlert(id, { actor } = {}) {
  const { rows } = await query(
    `UPDATE monitoring_alerts
        SET status = 'resolved', resolved_by = $2, resolved_at = now(), updated_at = now()
      WHERE id = $1::uuid AND status IN ('open','acknowledged')
      RETURNING *`,
    [id, actor || 'superadmin']
  );
  return rows[0] || null;
}
