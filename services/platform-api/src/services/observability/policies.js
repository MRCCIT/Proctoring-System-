import { query } from '../../config/database.js';
import { setGlobalLoadLevel } from '../capacity/loadLevelStore.js';
import { setAiDegradationLevel, getAiDegradationLevel } from '../infra/degradation.js';

const DEFAULT_GLOBAL = {
  max_global_concurrent_sessions: 5000,
  max_api_rps: 2000,
  max_websocket_connections: 10000,
  max_ai_concurrency: 64,
  max_queue_capacity: 50000,
  lane_workers: { P0: 8, P1: 6, P2: 4, P3: 4, P4: 2 },
  db_pool_max: 50,
  redis_memory_alert_pct: 85,
  upload_throughput_mbps: 500,
  load_level: 'L0',
  load_level_manual: false,
  ai_degradation_level: 0,
  ai_degradation_manual: false,
  optimization_mode: 'OBSERVE',
};

const DEFAULT_TENANT = {
  max_concurrent_sessions: 100,
  storage_mb: 10240,
  api_requests_per_minute: 600,
  max_websocket_connections: 200,
  daily_egress_mb: 51200,
  ai_concurrency: 8,
  ai_features: {
    ai_face_detection: true,
    ai_audio_analysis: false,
    gaze_detection: true,
    phone_detection: true,
  },
  queue_concurrency: 20,
  lane_limits: { P0: 100, P1: 100, P2: 50, P3: 50, P4: 20 },
  priority: 'normal',
  degradation_policy: 'follow_global',
};

export async function getGlobalPolicies() {
  try {
    const { rows } = await query(`SELECT * FROM global_resource_policies WHERE id = 1`);
    if (!rows[0]) return { version: 0, policies: { ...DEFAULT_GLOBAL }, updated_at: null };
    return {
      version: rows[0].version,
      policies: { ...DEFAULT_GLOBAL, ...(rows[0].policies || {}) },
      updated_by: rows[0].updated_by,
      updated_at: rows[0].updated_at,
      previous_policies: rows[0].previous_policies,
    };
  } catch {
    return { version: 0, policies: { ...DEFAULT_GLOBAL }, updated_at: null };
  }
}

export async function updateGlobalPolicies(patch, { actorId, actorEmail, reason } = {}) {
  const current = await getGlobalPolicies();
  const next = { ...current.policies, ...patch };
  const { rows } = await query(
    `UPDATE global_resource_policies
        SET policies = $1::jsonb,
            previous_policies = $2::jsonb,
            version = version + 1,
            updated_by = $3,
            updated_at = now()
      WHERE id = 1
      RETURNING *`,
    [JSON.stringify(next), JSON.stringify(current.policies), actorEmail || actorId || 'superadmin']
  );
  await writeControlAudit({
    actor_id: actorId,
    actor_email: actorEmail,
    action: 'global_policies.updated',
    scope: 'global',
    resource: 'global_resource_policies',
    old_value: current.policies,
    new_value: next,
    reason,
  });
  if (next.load_level_manual && next.load_level) {
    setGlobalLoadLevel(next.load_level, { manual: true });
  }
  if (next.ai_degradation_manual && next.ai_degradation_level != null) {
    await setAiDegradationLevel(next.ai_degradation_level);
  }
  return {
    version: rows[0].version,
    policies: rows[0].policies,
    updated_at: rows[0].updated_at,
    updated_by: rows[0].updated_by,
  };
}

export async function rollbackGlobalPolicies({ actorId, actorEmail, reason } = {}) {
  const current = await getGlobalPolicies();
  if (!current.previous_policies) {
    const e = new Error('No previous global policy to rollback');
    e.status = 422;
    throw e;
  }
  return updateGlobalPolicies(current.previous_policies, {
    actorId,
    actorEmail,
    reason: reason || 'rollback',
  });
}

export async function getTenantPolicies(tenantId) {
  const { rows: t } = await query(`SELECT quotas, feature_flags FROM tenants WHERE id = $1`, [tenantId]);
  if (!t[0]) {
    const e = new Error('Tenant not found');
    e.status = 404;
    throw e;
  }
  let stored = {};
  try {
    const { rows } = await query(`SELECT * FROM tenant_resource_policies WHERE tenant_id = $1`, [tenantId]);
    stored = rows[0]?.policies || {};
    return {
      version: rows[0]?.version || 0,
      policies: {
        ...DEFAULT_TENANT,
        max_concurrent_sessions: t[0].quotas?.max_concurrent_sessions ?? DEFAULT_TENANT.max_concurrent_sessions,
        storage_mb: t[0].quotas?.storage_mb ?? DEFAULT_TENANT.storage_mb,
        ai_features: { ...DEFAULT_TENANT.ai_features, ...(t[0].feature_flags || {}) },
        ...stored,
      },
      updated_at: rows[0]?.updated_at || null,
      updated_by: rows[0]?.updated_by || null,
    };
  } catch {
    return {
      version: 0,
      policies: {
        ...DEFAULT_TENANT,
        max_concurrent_sessions: t[0].quotas?.max_concurrent_sessions ?? DEFAULT_TENANT.max_concurrent_sessions,
        storage_mb: t[0].quotas?.storage_mb ?? DEFAULT_TENANT.storage_mb,
        ai_features: { ...DEFAULT_TENANT.ai_features, ...(t[0].feature_flags || {}) },
      },
      updated_at: null,
    };
  }
}

export async function updateTenantPolicies(tenantId, patch, { actorId, actorEmail, reason } = {}) {
  const current = await getTenantPolicies(tenantId);
  const next = { ...current.policies, ...patch };
  if (patch.ai_features) {
    next.ai_features = { ...current.policies.ai_features, ...patch.ai_features };
  }

  await query(
    `UPDATE tenants SET
       quotas = jsonb_set(jsonb_set(COALESCE(quotas,'{}'::jsonb), '{max_concurrent_sessions}', to_jsonb($2::int), true), '{storage_mb}', to_jsonb($3::int), true),
       feature_flags = COALESCE(feature_flags,'{}'::jsonb) || $4::jsonb,
       updated_at = now()
     WHERE id = $1`,
    [
      tenantId,
      Number(next.max_concurrent_sessions) || 100,
      Number(next.storage_mb) || 10240,
      JSON.stringify(next.ai_features || {}),
    ]
  );

  const { rows } = await query(
    `INSERT INTO tenant_resource_policies (tenant_id, policies, previous_policies, version, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, 1, $4, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       previous_policies = tenant_resource_policies.policies,
       policies = EXCLUDED.policies,
       version = tenant_resource_policies.version + 1,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [tenantId, JSON.stringify(next), JSON.stringify(current.policies), actorEmail || actorId || 'superadmin']
  );

  await writeControlAudit({
    actor_id: actorId,
    actor_email: actorEmail,
    action: 'tenant_policies.updated',
    scope: 'tenant',
    tenant_id: tenantId,
    resource: 'tenant_resource_policies',
    old_value: current.policies,
    new_value: next,
    reason,
  });

  return {
    version: rows[0].version,
    policies: rows[0].policies,
    updated_at: rows[0].updated_at,
    updated_by: rows[0].updated_by,
  };
}

export async function writeControlAudit(entry) {
  try {
    await query(
      `INSERT INTO control_audit_logs
        (actor_id, actor_email, action, scope, tenant_id, resource, old_value, new_value, reason, source, success, details)
       VALUES ($1,$2,$3,$4,$5::uuid,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12::jsonb)`,
      [
        entry.actor_id || null,
        entry.actor_email || null,
        entry.action,
        entry.scope || 'global',
        entry.tenant_id || null,
        entry.resource || null,
        JSON.stringify(entry.old_value ?? null),
        JSON.stringify(entry.new_value ?? null),
        entry.reason || null,
        entry.source || 'manual',
        entry.success !== false,
        JSON.stringify(entry.details || {}),
      ]
    );
  } catch {
    /* ignore if table missing */
  }
  try {
    const { writeAuditLog } = await import('../auditLogWriter.js');
    await writeAuditLog({
      actorType: 'superadmin',
      actorId: entry.actor_id,
      action: entry.action,
      resourceType: entry.resource || 'infra_control',
      resourceId: entry.tenant_id || 'global',
      tenantId: entry.tenant_id || null,
      details: {
        old: entry.old_value,
        new: entry.new_value,
        reason: entry.reason,
        source: entry.source || 'manual',
      },
    });
  } catch {
    /* ignore */
  }
}

export async function listControlAudit({ cursor, limit = 50, tenant_id } = {}) {
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const params = [];
  let where = 'WHERE 1=1';
  if (tenant_id) {
    params.push(tenant_id);
    where += ` AND tenant_id = $${params.length}::uuid`;
  }
  if (cursor) {
    params.push(cursor);
    where += ` AND id < $${params.length}::bigint`;
  }
  params.push(lim + 1);
  const { rows } = await query(
    `SELECT * FROM control_audit_logs ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;
  return { items, next_cursor: hasMore ? String(items[items.length - 1].id) : null };
}

export async function syncRuntimeFromPolicies() {
  try {
    const g = await getGlobalPolicies();
    if (g.policies.load_level_manual) setGlobalLoadLevel(g.policies.load_level, { manual: true });
    if (g.policies.ai_degradation_manual) await setAiDegradationLevel(g.policies.ai_degradation_level);
    else {
      const lvl = await getAiDegradationLevel();
      void lvl;
    }
  } catch {
    /* ignore */
  }
}

export { DEFAULT_GLOBAL, DEFAULT_TENANT };
