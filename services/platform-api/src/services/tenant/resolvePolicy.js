import { query } from '../../config/database.js';
import { clipAiModules, getTenantFeatureFlags } from './aiFeatureAllowList.js';

export const DEFAULT_AI_MODULES = {
  face_detection: true,
  multiple_faces: true,
  gaze_tracking: true,
  phone_detection: true,
  object_detection: true,
  audio_voice: true,
  audio_noise: true,
  keystroke: false,
  network: true,
};

export const DEFAULT_THRESHOLDS = { warn: 1, flag: 3, terminate: 8 };

const ALLOWED_OVERRIDE_KEYS = new Set([
  'ai_modules',
  'ai_sensitivity',
  'grace_period_seconds',
  'severity_thresholds',
  'whitelist',
  'rules',
]);

function platformDefaults() {
  return {
    policy_template_id: null,
    source: 'platform',
    ai_modules: { ...DEFAULT_AI_MODULES },
    ai_sensitivity: 'normal',
    grace_period_seconds: 5,
    severity_thresholds: { ...DEFAULT_THRESHOLDS },
    whitelist: {},
    rules: {},
  };
}

function fromTemplateRow(row, source) {
  return {
    policy_template_id: row.id,
    source,
    ai_modules: { ...DEFAULT_AI_MODULES, ...(row.ai_modules || {}) },
    ai_sensitivity: ['low', 'normal', 'high'].includes(row.ai_sensitivity) ? row.ai_sensitivity : 'normal',
    grace_period_seconds: Number.isFinite(parseInt(row.grace_period_seconds, 10))
      ? parseInt(row.grace_period_seconds, 10)
      : 5,
    severity_thresholds: { ...DEFAULT_THRESHOLDS, ...(row.severity_thresholds || {}) },
    whitelist: row.whitelist && typeof row.whitelist === 'object' ? row.whitelist : {},
    rules: row.rules && typeof row.rules === 'object' ? row.rules : {},
  };
}

function applyOverrides(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return base;
  const next = { ...base };
  if (overrides.ai_modules && typeof overrides.ai_modules === 'object') {
    next.ai_modules = { ...next.ai_modules, ...overrides.ai_modules };
  }
  if (['low', 'normal', 'high'].includes(overrides.ai_sensitivity)) {
    next.ai_sensitivity = overrides.ai_sensitivity;
  }
  if (Number.isFinite(parseInt(overrides.grace_period_seconds, 10))) {
    next.grace_period_seconds = parseInt(overrides.grace_period_seconds, 10);
  }
  if (overrides.severity_thresholds && typeof overrides.severity_thresholds === 'object') {
    next.severity_thresholds = { ...next.severity_thresholds, ...overrides.severity_thresholds };
  }
  if (overrides.whitelist && typeof overrides.whitelist === 'object') {
    next.whitelist = overrides.whitelist;
  }
  if (overrides.rules && typeof overrides.rules === 'object') {
    next.rules = overrides.rules;
  }
  next.source = next.source === 'platform' ? 'override' : `${next.source}+override`;
  return next;
}

function sanitizeOverrides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ALLOWED_OVERRIDE_KEYS) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Resolve effective proctoring policy for a session.
 * Order: Integration overrides → exam linked policy → exam JSON → session template policy → tenant default → platform.
 */
export async function resolveEffectivePolicy(tenantId, { examId = null, overrides = null } = {}) {
  const cleanOverrides = sanitizeOverrides(overrides);
  let resolved = platformDefaults();

  const { rows: defaults } = await query(
    `SELECT id, ai_modules, ai_sensitivity, grace_period_seconds, severity_thresholds, whitelist, rules
       FROM policy_templates
      WHERE tenant_id = $1 AND is_default = true
      LIMIT 1`,
    [tenantId]
  );
  if (defaults[0]) {
    resolved = fromTemplateRow(defaults[0], 'tenant_default');
  }

  if (examId) {
    const { rows: exams } = await query(
      `SELECT e.id, e.ai_modules, e.ai_sensitivity, e.policy_template, e.policy_template_id, e.session_template_id,
              pt.id AS linked_policy_id, pt.ai_modules AS pt_modules, pt.ai_sensitivity AS pt_sensitivity,
              pt.grace_period_seconds AS pt_grace, pt.severity_thresholds AS pt_thresholds,
              pt.whitelist AS pt_whitelist, pt.rules AS pt_rules,
              st.default_policy_template_id AS st_policy_id,
              st.default_ai_modules AS st_modules, st.default_ai_sensitivity AS st_sensitivity,
              stp.id AS st_pol_id, stp.ai_modules AS stp_modules, stp.ai_sensitivity AS stp_sensitivity,
              stp.grace_period_seconds AS stp_grace, stp.severity_thresholds AS stp_thresholds,
              stp.whitelist AS stp_whitelist, stp.rules AS stp_rules
         FROM exams e
         LEFT JOIN policy_templates pt ON pt.id = e.policy_template_id AND pt.tenant_id = e.tenant_id
         LEFT JOIN session_templates st ON st.id = e.session_template_id AND st.tenant_id = e.tenant_id
         LEFT JOIN policy_templates stp ON stp.id = st.default_policy_template_id AND stp.tenant_id = e.tenant_id
        WHERE e.id = $1 AND e.tenant_id = $2`,
      [examId, tenantId]
    );
    const exam = exams[0];
    if (exam) {
      if (exam.st_pol_id) {
        resolved = fromTemplateRow(
          {
            id: exam.st_pol_id,
            ai_modules: exam.stp_modules,
            ai_sensitivity: exam.stp_sensitivity,
            grace_period_seconds: exam.stp_grace,
            severity_thresholds: exam.stp_thresholds,
            whitelist: exam.stp_whitelist,
            rules: exam.stp_rules,
          },
          'session_template'
        );
      } else if (exam.st_modules && Object.keys(exam.st_modules || {}).length) {
        resolved = {
          ...resolved,
          source: 'session_template',
          ai_modules: { ...resolved.ai_modules, ...exam.st_modules },
          ai_sensitivity: ['low', 'normal', 'high'].includes(exam.st_sensitivity)
            ? exam.st_sensitivity
            : resolved.ai_sensitivity,
        };
      }

      if (exam.linked_policy_id) {
        resolved = fromTemplateRow(
          {
            id: exam.linked_policy_id,
            ai_modules: exam.pt_modules,
            ai_sensitivity: exam.pt_sensitivity,
            grace_period_seconds: exam.pt_grace,
            severity_thresholds: exam.pt_thresholds,
            whitelist: exam.pt_whitelist,
            rules: exam.pt_rules,
          },
          'exam'
        );
      } else {
        const examModules = exam.ai_modules && typeof exam.ai_modules === 'object' ? exam.ai_modules : {};
        const examPolicy =
          exam.policy_template && typeof exam.policy_template === 'object' ? exam.policy_template : {};
        if (Object.keys(examModules).length || Object.keys(examPolicy).length || exam.ai_sensitivity) {
          resolved = {
            ...resolved,
            source: 'exam',
            policy_template_id: resolved.policy_template_id,
            ai_modules: { ...resolved.ai_modules, ...examModules },
            ai_sensitivity: ['low', 'normal', 'high'].includes(exam.ai_sensitivity)
              ? exam.ai_sensitivity
              : resolved.ai_sensitivity,
            grace_period_seconds: Number.isFinite(parseInt(examPolicy.grace_period_seconds, 10))
              ? parseInt(examPolicy.grace_period_seconds, 10)
              : resolved.grace_period_seconds,
            severity_thresholds: {
              ...resolved.severity_thresholds,
              ...(examPolicy.severity_thresholds || {}),
            },
            whitelist: examPolicy.whitelist || resolved.whitelist,
            rules: examPolicy.rules || resolved.rules,
          };
        }
      }
    }
  }

  if (cleanOverrides) {
    resolved = applyOverrides(resolved, cleanOverrides);
  }

  // Continuous SA allow-list: disabled services never run, even if template still lists them
  const flags = await getTenantFeatureFlags(query, tenantId);
  resolved.ai_modules = clipAiModules(resolved.ai_modules, flags);

  return {
    ...resolved,
    resolved_at: new Date().toISOString(),
  };
}

/** Apply linked template fields onto an exam row when creating/updating. */
export async function materializeExamPolicyFields(tenantId, { policy_template_id, session_template_id }) {
  const out = {
    policy_template_id: policy_template_id || null,
    session_template_id: session_template_id || null,
    ai_modules: { ...DEFAULT_AI_MODULES },
    ai_sensitivity: 'normal',
    policy_template: {},
  };

  if (session_template_id) {
    const { rows } = await query(
      `SELECT st.default_ai_modules, st.default_ai_sensitivity, st.default_policy_template_id,
              pt.ai_modules, pt.ai_sensitivity, pt.grace_period_seconds, pt.severity_thresholds, pt.whitelist, pt.rules
         FROM session_templates st
         LEFT JOIN policy_templates pt ON pt.id = st.default_policy_template_id AND pt.tenant_id = st.tenant_id
        WHERE st.id = $1 AND st.tenant_id = $2`,
      [session_template_id, tenantId]
    );
    const st = rows[0];
    if (!st) {
      const e = new Error('Session template not found');
      e.status = 404;
      throw e;
    }
    out.ai_modules = { ...DEFAULT_AI_MODULES, ...(st.default_ai_modules || {}) };
    out.ai_sensitivity = st.default_ai_sensitivity || 'normal';
    if (st.default_policy_template_id && !policy_template_id) {
      out.policy_template_id = st.default_policy_template_id;
    }
    if (st.ai_modules) {
      out.ai_modules = { ...DEFAULT_AI_MODULES, ...st.ai_modules };
      out.ai_sensitivity = st.ai_sensitivity || out.ai_sensitivity;
      out.policy_template = {
        grace_period_seconds: st.grace_period_seconds,
        severity_thresholds: st.severity_thresholds,
        whitelist: st.whitelist,
        rules: st.rules,
      };
    }
  }

  if (out.policy_template_id || policy_template_id) {
    const pid = policy_template_id || out.policy_template_id;
    const { rows } = await query(
      `SELECT id, ai_modules, ai_sensitivity, grace_period_seconds, severity_thresholds, whitelist, rules
         FROM policy_templates WHERE id = $1 AND tenant_id = $2`,
      [pid, tenantId]
    );
    const pt = rows[0];
    if (!pt) {
      const e = new Error('Policy template not found');
      e.status = 404;
      throw e;
    }
    out.policy_template_id = pt.id;
    out.ai_modules = { ...DEFAULT_AI_MODULES, ...(pt.ai_modules || {}) };
    out.ai_sensitivity = pt.ai_sensitivity || 'normal';
    out.policy_template = {
      grace_period_seconds: pt.grace_period_seconds,
      severity_thresholds: pt.severity_thresholds,
      whitelist: pt.whitelist,
      rules: pt.rules,
    };
  }

  const flags = await getTenantFeatureFlags(query, tenantId);
  out.ai_modules = clipAiModules(out.ai_modules, flags);
  return out;
}
