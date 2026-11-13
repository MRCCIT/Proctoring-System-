'use client';

const LABELS: Record<string, string> = {
  blocked_shortcut: 'Blocked keyboard shortcut',
  tab_hidden: 'Tab switched away',
  tab_visible: 'Tab visible again',
  visibility_hidden: 'Tab switched away',
  visibility_visible: 'Tab visible again',
  context_menu: 'Right-click attempted',
  copy_attempt: 'Copy attempted',
  paste_attempt: 'Paste attempted',
  cut_attempt: 'Cut attempted',
  copy: 'Copy attempted',
  paste: 'Paste attempted',
  cut: 'Cut attempted',
  window_blur: 'Lost window focus',
  window_focus: 'Window focus returned',
  fullscreen_exit: 'Fullscreen exited',
  multiple_displays_detected: 'Multiple displays detected',
  single_display_detected: 'External display disconnected',
  identity_mismatch: 'Identity mismatch — face does not match enrolled photo',
  ai_identity_mismatch: 'Identity mismatch — face does not match enrolled photo',
  phone_detected: 'Phone detected',
  ai_phone_visible: 'Phone detected',
  no_face_detected: 'No face detected in camera',
  multiple_faces_detected: 'Multiple faces detected',
  audio_voice_detected: 'Background voice detected',
  audio_noise_detected: 'Loud background noise detected',
  screen_share_ended: 'Screen sharing stopped',
  track_ended: 'Camera or microphone stopped',
  track_muted: 'Camera or microphone muted',
  network_offline: 'Network connection lost',
  keystroke_paste_burst: 'Paste-like keystroke burst',
  keystroke_high_velocity: 'Unusually fast typing',
  keystroke_long_pause: 'Unusually long pause',
};

const NOT_ALERTS = new Set([
  'tab_visible',
  'visibility_visible',
  'window_focus',
  'single_display_detected',
  'network_online',
  'heartbeat',
]);

const PATTERN_LABELS: Array<[RegExp, string]> = [
  [/gaze|looking_sideways/, 'Looking away from the screen'],
  [/phone|electronics/, 'Electronic device detected'],
  [/face/, 'Face not clearly visible'],
];

function labelFor(code: string) {
  if (LABELS[code]) return LABELS[code];
  const bare = code.replace(/^ai_/, '');
  if (LABELS[bare]) return LABELS[bare];
  for (const [re, label] of PATTERN_LABELS) if (re.test(bare)) return label;
  return 'Unusual activity detected';
}

export function ViolationAlert(props: { violations: string[] }) {
  const labels = [...new Set(props.violations.filter((v) => !NOT_ALERTS.has(v)).map(labelFor))];
  if (!labels.length) return null;
  return (
    <div
      style={{
        background: '#fff7ed',
        border: '1px solid #fed7aa',
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <strong style={{ color: '#9a3412' }}>Please follow the session rules</strong>
      <div style={{ color: '#9a3412', marginTop: 2 }}>The following were noted and may be reviewed by your organization:</div>
      <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
        {labels.map((l) => (
          <li key={l} style={{ color: '#7c2d12' }}>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
