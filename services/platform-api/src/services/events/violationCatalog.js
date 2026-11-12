/**
 * Canonical violation / event catalog for session_events enrichment and SQL predicates.
 */

const CATALOG = {
  face_lost: { label: 'Face not detected', category: 'identity', severity: 'flag' },
  multiple_faces: { label: 'Multiple faces', category: 'identity', severity: 'critical' },
  face_mismatch: { label: 'Face mismatch', category: 'identity', severity: 'critical' },
  looking_away: { label: 'Looking away', category: 'gaze', severity: 'warn' },
  phone_detected: { label: 'Phone detected', category: 'object', severity: 'flag' },
  object_detected: { label: 'Unauthorized object', category: 'object', severity: 'flag' },
  tab_switch: { label: 'Tab switch', category: 'browser', severity: 'flag' },
  window_blur: { label: 'Window lost focus', category: 'browser', severity: 'warn' },
  fullscreen_exit: { label: 'Left fullscreen', category: 'browser', severity: 'flag' },
  copy_paste: { label: 'Copy / paste', category: 'browser', severity: 'warn' },
  context_menu: { label: 'Context menu', category: 'browser', severity: 'info' },
  print_attempt: { label: 'Print attempt', category: 'browser', severity: 'warn' },
  devtools: { label: 'DevTools suspected', category: 'browser', severity: 'flag' },
  screen_share_stopped: { label: 'Screen share stopped', category: 'media', severity: 'critical' },
  camera_blocked: { label: 'Camera blocked', category: 'media', severity: 'critical' },
  mic_blocked: { label: 'Microphone blocked', category: 'media', severity: 'flag' },
  network_drop: { label: 'Network drop', category: 'network', severity: 'info' },
  heartbeat_missed: { label: 'Heartbeat missed', category: 'network', severity: 'warn' },
  voice_detected: { label: 'Voice detected', category: 'audio', severity: 'warn' },
  noise_detected: { label: 'Background noise', category: 'audio', severity: 'info' },
  vm_detected: { label: 'VM / remote desktop signal', category: 'integrity', severity: 'critical' },
  second_monitor: { label: 'Second monitor', category: 'integrity', severity: 'flag' },
  lockdown_violation: { label: 'Lockdown policy violation', category: 'lockdown', severity: 'flag' },
  session_started: { label: 'Session started', category: 'system', severity: 'info' },
  session_ended: { label: 'Session ended', category: 'system', severity: 'info' },
  session_paused: { label: 'Session paused', category: 'system', severity: 'info' },
  session_resumed: { label: 'Session resumed', category: 'system', severity: 'info' },
};

const ALIASES = {
  multi_face: 'multiple_faces',
  no_face: 'face_lost',
  face_absent: 'face_lost',
  gaze_away: 'looking_away',
  phone: 'phone_detected',
  tab_switch_detected: 'tab_switch',
  blur: 'window_blur',
  focus_lost: 'window_blur',
  fullscreen_left: 'fullscreen_exit',
  clipboard: 'copy_paste',
};

export function canonicalCode(eventType) {
  let s = String(eventType || '')
    .toLowerCase()
    .trim();
  s = s.replace(/^violation\./, '').replace(/^ai\./, '').replace(/^ai_/, '');
  return ALIASES[s] || s;
}

export function isAiDerived(eventType) {
  const s = String(eventType || '').toLowerCase();
  return s.startsWith('ai.') || s.startsWith('violation.ai_') || ['face_lost', 'multiple_faces'].includes(s);
}

export function describeEvent(eventType, storedSeverity) {
  const code = canonicalCode(eventType);
  const entry = CATALOG[code];
  const severity = entry?.severity || storedSeverity || 'info';
  const label = entry?.label || code.replace(/[._]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const category = entry?.category || (String(eventType).startsWith('violation.') ? 'other' : 'system');
  return {
    code,
    label,
    category,
    severity,
    is_violation: ['warn', 'flag', 'critical'].includes(severity),
    source: isAiDerived(eventType) ? 'ai' : String(eventType).startsWith('violation.') ? 'browser' : 'system',
  };
}

/** SQL fragment matching rows that count as violations (used for list/aggregate queries). */
export function violationSqlPredicate(alias = 'se') {
  const infoCodes = Object.entries(CATALOG)
    .filter(([, v]) => v.severity === 'info')
    .flatMap(([k]) => [`violation.${k}`, `ai.${k}`, `violation.ai_${k}`, k]);
  const list = infoCodes.map((c) => `'${c}'`).join(',');
  return `(${alias}.severity IN ('warn','flag','critical') AND ${alias}.event_type NOT IN (${list}))`;
}

const lastAi = new Map();

/**
 * Client and server both report AI detections; record one per session+code per cooldown window.
 * In-process only — acceptable because duplicates are cosmetic, not lost evidence.
 */
export function shouldRecordAiEvent(sessionId, eventType, cooldownMs = 8000) {
  if (!isAiDerived(eventType)) return true;
  const k = `${sessionId}:${canonicalCode(eventType)}`;
  const now = Date.now();
  if (now - (lastAi.get(k) || 0) < cooldownMs) return false;
  lastAi.set(k, now);
  if (lastAi.size > 50_000) lastAi.clear();
  return true;
}

export function enrichEvent(row) {
  const d = describeEvent(row.event_type, row.severity);
  return { ...row, ...d };
}

export { CATALOG };
