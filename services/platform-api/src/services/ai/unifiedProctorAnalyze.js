import { analyzeSessionFrame } from './aiClient.js';
import { getSessionProctorState } from './sessionProctorState.js';
import { persistUnifiedProctorTick } from './monitoringPersistence.js';
import { getSessionIdentityReference } from '../sdk/identityReference.js';

const referenceCache = new Map();

async function loadReferenceDataUrl(tenantId, sessionId) {
  const cacheKey = `${tenantId}:${sessionId}`;
  if (referenceCache.has(cacheKey)) return referenceCache.get(cacheKey);

  const ref = await getSessionIdentityReference(tenantId, sessionId);
  const dataUrl = ref.enrolled && ref.data_url ? ref.data_url : null;
  referenceCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export function clearReferenceCache(sessionId) {
  for (const k of referenceCache.keys()) {
    if (k.endsWith(`:${sessionId}`)) referenceCache.delete(k);
  }
}

/**
 * One proctor tick: Python microservices (face, gaze, phone, identity) in a single call.
 */
async function loadSessionModules(tenantId, sessionId) {
  const { query } = await import('../../config/database.js');
  const { rows } = await query(
    `SELECT ai_config FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  const modules = rows[0]?.ai_config?.ai_modules;
  return modules && typeof modules === 'object' ? modules : {};
}

export async function runUnifiedProctorTick(tenantId, sessionId, imageDataUrl, options = {}) {
  const state = getSessionProctorState(sessionId);
  let reference_image = options.reference_image || null;
  if (!reference_image && options.loadReference !== false) {
    reference_image = await loadReferenceDataUrl(tenantId, sessionId);
  }

  const tickIndex = state.tickCount;
  state.tickCount += 1;

  const modules = options.modules || (await loadSessionModules(tenantId, sessionId));
  const moduleOn = (key, fallback = true) => (key in modules ? Boolean(modules[key]) : fallback);

  const deepGazeEvery = parseInt(process.env.DEEP_GAZE_EVERY_N_TICKS || '2', 10) || 2;
  const deepGaze =
    options.run_deep_gaze != null
      ? Boolean(options.run_deep_gaze)
      : moduleOn('gaze_tracking') && tickIndex % deepGazeEvery === 0;

  const payload = {
    image: imageDataUrl,
    reference_image: reference_image || undefined,
    identity_threshold: options.identity_threshold,
    phone_streak: state.phoneStreak,
    phone_active: state.phoneActive,
    electronics_streak: state.electronicsStreak,
    electronics_active: state.electronicsActive,
    multiple_face_streak: state.multipleFaceStreak,
    multiple_face_active: state.multipleFaceActive,
    identity_mismatch_streak: state.identityMismatchStreak,
    tick_index: tickIndex,
    run_identity: Boolean(options.run_identity) && moduleOn('face_detection'),
    run_phone: options.run_phone !== false && moduleOn('object_detection'),
    run_electronics: options.run_electronics === true && moduleOn('object_detection'),
    run_deep_gaze: deepGaze,
    modules,
  };

  const analysis = await analyzeSessionFrame(payload);

  state.phoneStreak = analysis.phone_streak ?? 0;
  state.phoneActive = Boolean(analysis.phone_active);
  state.electronicsStreak = analysis.electronics_streak ?? 0;
  state.electronicsActive = Boolean(analysis.electronics_active);
  state.multipleFaceStreak = analysis.multiple_face_streak ?? 0;
  state.multipleFaceActive = Boolean(analysis.multiple_face_active);
  state.identityMismatchStreak = analysis.identity_mismatch_streak ?? 0;
  state.lastTickAt = Date.now();

  const violations = analysis.violations || [];
  const shouldPersist =
    options.persist &&
    (violations.length > 0 ||
      tickIndex % 8 === 0 ||
      Boolean(analysis.phone_detected) ||
      Boolean(analysis.phone_active) ||
      Boolean(analysis.electronics_active));

  let persistence = { events: 0, face_check: false, deferred: false };
  let persist_error = null;
  if (shouldPersist) {
    persistence = { events: 0, face_check: false, deferred: true };
    // pass the original image data URL so the persistence layer can store a snapshot
    void persistUnifiedProctorTick(tenantId, sessionId, analysis, imageDataUrl)
      .then((p) => {
        persistence = { ...p, deferred: false };
      })
      .catch((e) => {
        persist_error = e.message || String(e);
        console.error('[unifiedProctor] persist failed', sessionId, persist_error);
      });
  }

  return { analysis, persistence, persist_error, state: { ...state } };
}
