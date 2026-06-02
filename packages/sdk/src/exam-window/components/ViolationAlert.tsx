'use client';

const LABELS: Record<string, string> = {
  blocked_shortcut: 'Blocked keyboard shortcut',
  tab_hidden: 'Tab switched away',
  tab_visible: 'Tab visible again',
  context_menu: 'Right-click attempted',
  copy_attempt: 'Copy attempted',
  paste_attempt: 'Paste attempted',
  cut_attempt: 'Cut attempted',
  window_blur: 'Lost window focus',
  window_focus: 'Window focus returned',
  fullscreen_exit: 'Fullscreen exited',
  no_face_detected: 'No face detected in camera',
  multiple_faces_detected: 'Multiple faces detected',
  audio_voice_detected: 'Background voice detected',
  network_offline: 'Network connection lost',
  keystroke_paste_burst: 'Paste-like keystroke burst',
  keystroke_high_velocity: 'Unusually fast typing',
  keystroke_long_pause: 'Unusually long pause',
};

export function ViolationAlert(props: { violations: string[] }) {
  if (!props.violations.length) return null;
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
      <strong style={{ color: '#9a3412' }}>Policy alerts</strong>
      <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
        {props.violations.map((v) => (
          <li key={v} style={{ color: '#7c2d12' }}>
            {LABELS[v] || v}
          </li>
        ))}
      </ul>
    </div>
  );
}
