export type ViolationSeverity = 'critical' | 'warning' | 'info';

const FRIENDLY_LABELS: Record<string, string> = {
  visibility_hidden: 'Tab switched away',
  visibility_visible: 'Tab visible again',
  tab_hidden: 'Tab switched away',
  tab_visible: 'Tab visible again',
  window_blur: 'Window lost focus',
  window_focus: 'Window focus returned',
  screen_share_ended: 'Screen sharing stopped',
  track_ended: 'Camera/mic stopped',
  track_muted: 'Camera/mic muted',
  identity_mismatch: 'Identity mismatch',
  ai_identity_mismatch: 'Identity mismatch',
  audio_voice_detected: 'Background voice',
  audio_noise_detected: 'Loud background noise',
  phone_detected: 'Phone detected',
  ai_phone_visible: 'Phone detected',
  phone_visible: 'Phone detected',
  looking_sideways: 'Looking sideways',
  ai_looking_sideways: 'Looking sideways',
  gaze_left: 'Gaze left',
  gaze_right: 'Gaze right',
  ai_gaze_left: 'Gaze left',
  ai_gaze_right: 'Gaze right',
  no_face_detected: 'No face detected',
  multiple_faces_detected: 'Multiple faces',
};

export function candidateInitials(name?: string, email?: string): string {
  const n = (name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || '').trim();
  return e ? e.slice(0, 2).toUpperCase() : '?';
}

/** Bucket used by Live violation chips (Tab/focus, Gaze, …). */
export function violationBucket(code: string): string {
  const lower = (code || '').toLowerCase();
  if (/visibility|tab_hidden|tab_switch|window_blur|window_focus|focus|screen_share/.test(lower)) return 'focus';
  if (/gaze|looking|sideways|head/.test(lower)) return 'gaze';
  if (/phone|electronics|object/.test(lower)) return 'object';
  if (/identity/.test(lower)) return 'identity';
  if (/audio|noise|voice/.test(lower)) return 'audio';
  return 'other';
}

export function parseViolationCaption(caption: string): {
  label: string;
  code: string;
  severity: ViolationSeverity;
  bucket: string;
} {
  const raw = caption.replace(/^Violation:\s*/i, '').trim();
  const code = raw.split(/\s*[-–·]\s*/)[0]?.trim() || raw;
  const key = code.toLowerCase();
  const label =
    FRIENDLY_LABELS[key] ||
    FRIENDLY_LABELS[key.replace(/^ai_/, '')] ||
    code
      .replace(/^ai_/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const lower = code.toLowerCase();
  let severity: ViolationSeverity = 'warning';
  if (/tab|visibility|window|focus|phone|identity|multiple|absent|screen_share/.test(lower)) severity = 'critical';
  else if (/gaze|looking|sideways|head|audio|noise|voice/.test(lower)) severity = 'warning';
  else severity = 'info';
  return { label, code, severity, bucket: violationBucket(code) };
}

export function sessionStatusTone(status?: string): 'active' | 'paused' | 'ended' | 'unknown' {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'in_progress') return 'active';
  if (s === 'paused') return 'paused';
  if (s === 'completed' || s === 'terminated' || s === 'ended') return 'ended';
  return 'unknown';
}

export function formatMatchScore(score: number | null | undefined): string | null {
  if (score == null || Number.isNaN(score)) return null;
  const n = Number(score);
  if (n <= 1) return `${Math.round(n * 100)}%`;
  if (n <= 100) return `${Math.round(n)}%`;
  return `${n.toFixed(1)}`;
}
