/** Map client lockdown event types into session_events / violation catalog codes. */

const MAP = {
  visibility_hidden: { event_type: 'violation.tab_switch', severity: 'flag' },
  window_blur: { event_type: 'violation.window_blur', severity: 'warn' },
  fullscreen_exit: { event_type: 'violation.fullscreen_exit', severity: 'flag' },
  copy: { event_type: 'violation.copy_paste', severity: 'warn' },
  paste: { event_type: 'violation.copy_paste', severity: 'warn' },
  cut: { event_type: 'violation.copy_paste', severity: 'warn' },
  context_menu: { event_type: 'violation.context_menu', severity: 'info' },
  print: { event_type: 'violation.print_attempt', severity: 'warn' },
  devtools_heuristic: { event_type: 'violation.devtools', severity: 'flag' },
  multi_monitor: { event_type: 'violation.second_monitor', severity: 'flag' },
  screen_share_ended: { event_type: 'violation.screen_share_stopped', severity: 'critical' },
  track_muted: { event_type: 'violation.camera_blocked', severity: 'flag' },
  track_ended: { event_type: 'violation.camera_blocked', severity: 'critical' },
  second_tab: { event_type: 'violation.tab_switch', severity: 'critical' },
  webdriver: { event_type: 'violation.vm_detected', severity: 'critical' },
  heartbeat: null,
  visibility_visible: null,
  window_focus: null,
  fullscreen_enter: null,
};

export function mapLockdownEventToViolation(ev) {
  const type = String(ev?.type || '');
  const mapped = MAP[type];
  if (!mapped) return null;
  return {
    event_type: mapped.event_type,
    severity: mapped.severity,
    payload: {
      lockdown_type: type,
      seq: ev.seq,
      confidence: ev.confidence,
      meta: ev.meta || {},
      policy_version: ev.policy_version,
    },
  };
}
