/**
 * Super Admin feature_flags → policy ai_modules mapping.
 * Runtime always intersects template modules with the tenant's current allow-list
 * so SA updates apply continuously without tenant CRUD.
 */

export const FLAG_TO_MODULES = {
  ai_face_detection: ['face_detection'],
  multiple_faces: ['multiple_faces'],
  gaze_detection: ['gaze_tracking'],
  phone_detection: ['phone_detection'],
  object_detection: ['object_detection'],
  ai_audio_analysis: ['audio_voice', 'audio_noise'],
  network_monitoring: ['network'],
};

export const MODULE_LABELS = {
  face_detection: 'Face detection',
  multiple_faces: 'Multiple faces',
  gaze_tracking: 'Gaze tracking',
  phone_detection: 'Phone detection',
  object_detection: 'Object detection',
  audio_voice: 'Audio voice',
  audio_noise: 'Audio noise',
  keystroke: 'Keystroke',
  network: 'Network',
};

/** Build module allow map from tenant feature_flags (missing flag = allowed). */
export function moduleAllowMap(featureFlags = {}) {
  const flags = featureFlags && typeof featureFlags === 'object' ? featureFlags : {};
  const allow = {};
  for (const [flag, modules] of Object.entries(FLAG_TO_MODULES)) {
    const on = flags[flag] !== false;
    for (const m of modules) allow[m] = on;
  }
  return allow;
}

/** Human-readable allowed services for tenant UI. */
export function allowedServicesList(featureFlags = {}) {
  const allow = moduleAllowMap(featureFlags);
  const seen = new Set();
  const out = [];
  for (const modules of Object.values(FLAG_TO_MODULES)) {
    for (const m of modules) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push({
        key: m,
        label: MODULE_LABELS[m] || m,
        allowed: allow[m] !== false,
      });
    }
  }
  return out;
}

/** Clip ai_modules so SA-disabled services cannot run. */
export function clipAiModules(aiModules = {}, featureFlags = {}) {
  const base = aiModules && typeof aiModules === 'object' ? { ...aiModules } : {};
  const allow = moduleAllowMap(featureFlags);
  for (const [mod, ok] of Object.entries(allow)) {
    if (!ok) base[mod] = false;
  }
  return base;
}

export async function getTenantFeatureFlags(query, tenantId) {
  const { rows } = await query(`SELECT feature_flags FROM tenants WHERE id = $1`, [tenantId]);
  return rows[0]?.feature_flags || {};
}
