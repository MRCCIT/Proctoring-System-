import { query } from '../../config/database.js';

const DEFAULT_AI_MODULES = {
  face_detection: true,
  multiple_faces: true,
  gaze_tracking: true,
  object_detection: true,
  audio_voice: true,
  audio_noise: true,
  keystroke: false,
  network: true,
};

const DEFAULT_THRESHOLDS = { warn: 1, flag: 3, terminate: 8 };

const STRICT_AI_MODULES = {
  ...DEFAULT_AI_MODULES,
  keystroke: true,
  audio_voice: true,
  audio_noise: true,
};

/** Ensure every tenant has usable starter policies (not only the seed demo org). */
export async function ensureDefaultPolicyTemplates(tenantId) {
  const { rows } = await query(`SELECT id FROM policy_templates WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (rows.length) return;

  await query(
    `INSERT INTO policy_templates
       (tenant_id, name, description, ai_modules, ai_sensitivity, grace_period_seconds, severity_thresholds, whitelist, is_default)
     VALUES
       ($1, 'Standard', 'Default proctoring policy — face, gaze, objects, audio and network checks.',
        $2::jsonb, 'normal', 5, $3::jsonb, '[]'::jsonb, true),
       ($1, 'Strict', 'High-sensitivity policy for high-stakes exams.',
        $4::jsonb, 'high', 3, $5::jsonb, '[]'::jsonb, false)`,
    [
      tenantId,
      JSON.stringify(DEFAULT_AI_MODULES),
      JSON.stringify(DEFAULT_THRESHOLDS),
      JSON.stringify(STRICT_AI_MODULES),
      JSON.stringify({ warn: 1, flag: 2, terminate: 5 }),
    ]
  );
}

export async function listPolicyTemplates(tenantId) {
  await ensureDefaultPolicyTemplates(tenantId);
  const { rows } = await query(
    `SELECT p.id, p.name, p.description, p.rules, p.ai_modules, p.ai_sensitivity, p.grace_period_seconds,
            p.severity_thresholds, p.whitelist, p.is_default, p.created_at, p.updated_at,
            COALESCE((
              SELECT COUNT(*)::int FROM exams e
               WHERE e.tenant_id = p.tenant_id AND e.policy_template_id = p.id
            ), 0) AS exam_count
       FROM policy_templates p
      WHERE p.tenant_id = $1
      ORDER BY p.is_default DESC, p.created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function getPolicyTemplate(tenantId, id) {
  const { rows } = await query(
    `SELECT * FROM policy_templates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rows[0] || null;
}

export async function createPolicyTemplate(tenantId, body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const e = new Error('name is required');
    e.status = 422;
    throw e;
  }
  const description = body.description ? String(body.description) : null;
  const rules = body.rules && typeof body.rules === 'object' ? body.rules : {};
  const ai_modules = body.ai_modules && typeof body.ai_modules === 'object'
    ? { ...DEFAULT_AI_MODULES, ...body.ai_modules }
    : DEFAULT_AI_MODULES;
  const ai_sensitivity = ['low', 'normal', 'high'].includes(body.ai_sensitivity) ? body.ai_sensitivity : 'normal';
  const grace_period_seconds = Number.isFinite(parseInt(body.grace_period_seconds, 10))
    ? parseInt(body.grace_period_seconds, 10)
    : 5;
  const severity_thresholds = body.severity_thresholds && typeof body.severity_thresholds === 'object'
    ? { ...DEFAULT_THRESHOLDS, ...body.severity_thresholds }
    : DEFAULT_THRESHOLDS;
  const whitelist = Array.isArray(body.whitelist) ? body.whitelist : [];
  const is_default = Boolean(body.is_default);

  if (is_default) {
    await query(`UPDATE policy_templates SET is_default = false WHERE tenant_id = $1`, [tenantId]);
  }

  const { rows } = await query(
    `INSERT INTO policy_templates
       (tenant_id, name, description, rules, ai_modules, ai_sensitivity,
        grace_period_seconds, severity_thresholds, whitelist, is_default)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10)
     RETURNING *`,
    [
      tenantId,
      name,
      description,
      JSON.stringify(rules),
      JSON.stringify(ai_modules),
      ai_sensitivity,
      grace_period_seconds,
      JSON.stringify(severity_thresholds),
      JSON.stringify(whitelist),
      is_default,
    ]
  );
  return rows[0];
}

export async function updatePolicyTemplate(tenantId, id, body) {
  const existing = await getPolicyTemplate(tenantId, id);
  if (!existing) {
    const e = new Error('Policy template not found');
    e.status = 404;
    throw e;
  }
  const next = {
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    rules: body.rules && typeof body.rules === 'object' ? body.rules : existing.rules,
    ai_modules: body.ai_modules && typeof body.ai_modules === 'object' ? { ...existing.ai_modules, ...body.ai_modules } : existing.ai_modules,
    ai_sensitivity: body.ai_sensitivity || existing.ai_sensitivity,
    grace_period_seconds: Number.isFinite(parseInt(body.grace_period_seconds, 10))
      ? parseInt(body.grace_period_seconds, 10)
      : existing.grace_period_seconds,
    severity_thresholds: body.severity_thresholds && typeof body.severity_thresholds === 'object'
      ? { ...existing.severity_thresholds, ...body.severity_thresholds }
      : existing.severity_thresholds,
    whitelist: Array.isArray(body.whitelist) ? body.whitelist : existing.whitelist,
    is_default: body.is_default !== undefined ? Boolean(body.is_default) : existing.is_default,
  };
  if (next.is_default && !existing.is_default) {
    await query(`UPDATE policy_templates SET is_default = false WHERE tenant_id = $1`, [tenantId]);
  }
  const { rows } = await query(
    `UPDATE policy_templates
       SET name = $1, description = $2, rules = $3::jsonb, ai_modules = $4::jsonb,
           ai_sensitivity = $5, grace_period_seconds = $6, severity_thresholds = $7::jsonb,
           whitelist = $8::jsonb, is_default = $9, updated_at = now()
     WHERE tenant_id = $10 AND id = $11
     RETURNING *`,
    [
      next.name,
      next.description,
      JSON.stringify(next.rules),
      JSON.stringify(next.ai_modules),
      next.ai_sensitivity,
      next.grace_period_seconds,
      JSON.stringify(next.severity_thresholds),
      JSON.stringify(next.whitelist),
      next.is_default,
      tenantId,
      id,
    ]
  );
  return rows[0];
}

export async function deletePolicyTemplate(tenantId, id) {
  const { rowCount } = await query(`DELETE FROM policy_templates WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  return rowCount > 0;
}

export async function listSessionTemplates(tenantId) {
  const { rows } = await query(
    `SELECT id, name, description, default_duration_minutes, default_ai_modules,
            default_ai_sensitivity, default_branding, default_policy_template_id,
            created_at, updated_at
       FROM session_templates
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function createSessionTemplate(tenantId, body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const e = new Error('name is required');
    e.status = 422;
    throw e;
  }
  const { rows } = await query(
    `INSERT INTO session_templates
       (tenant_id, name, description, default_duration_minutes, default_ai_modules,
        default_ai_sensitivity, default_branding, default_policy_template_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)
     RETURNING *`,
    [
      tenantId,
      name,
      body.description ?? null,
      parseInt(body.default_duration_minutes || 60, 10),
      JSON.stringify(body.default_ai_modules || {}),
      body.default_ai_sensitivity || 'normal',
      JSON.stringify(body.default_branding || {}),
      body.default_policy_template_id || null,
    ]
  );
  return rows[0];
}

export async function updateSessionTemplate(tenantId, id, body) {
  const sets = [];
  const params = [];
  const map = {
    name: 'name',
    description: 'description',
    default_duration_minutes: 'default_duration_minutes',
    default_ai_sensitivity: 'default_ai_sensitivity',
    default_policy_template_id: 'default_policy_template_id',
  };
  for (const key of Object.keys(map)) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${map[key]} = $${params.length}`);
    }
  }
  if (body.default_ai_modules !== undefined) {
    params.push(JSON.stringify(body.default_ai_modules || {}));
    sets.push(`default_ai_modules = $${params.length}::jsonb`);
  }
  if (body.default_branding !== undefined) {
    params.push(JSON.stringify(body.default_branding || {}));
    sets.push(`default_branding = $${params.length}::jsonb`);
  }
  if (!sets.length) {
    const e = new Error('No updates provided');
    e.status = 422;
    throw e;
  }
  params.push(tenantId, id);
  const { rows } = await query(
    `UPDATE session_templates SET ${sets.join(', ')}, updated_at = now()
     WHERE tenant_id = $${params.length - 1} AND id = $${params.length}
     RETURNING *`,
    params
  );
  if (!rows.length) {
    const e = new Error('Session template not found');
    e.status = 404;
    throw e;
  }
  return rows[0];
}

export async function deleteSessionTemplate(tenantId, id) {
  const { rowCount } = await query(
    `DELETE FROM session_templates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rowCount > 0;
}
