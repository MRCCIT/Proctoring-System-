/**
 * Lockdown policy types.
 *
 * Honest scope: a normal web browser cannot be fully locked. This policy drives
 * defense-in-depth (client enforcement + server verification + violation logging).
 * STRICT mode expects Safe Exam Browser or an Electron kiosk bridge.
 */

export type LockdownMode = 'OFF' | 'STANDARD' | 'STRICT';
export type LockdownAction = 'LOG' | 'WARN' | 'PAUSE_EXAM' | 'AUTO_TERMINATE';
export type BrowserIntegrityMode = 'none' | 'seb' | 'kiosk';

export type LockdownRuleKey =
  | 'fullscreenExit'
  | 'tabSwitch'
  | 'windowBlur'
  | 'copyPaste'
  | 'contextMenu'
  | 'print'
  | 'devtools'
  | 'multiMonitor'
  | 'screenShareStopped'
  | 'cameraBlocked'
  | 'micBlocked'
  | 'heartbeatMissed'
  | 'webdriver'
  | 'secondSession';

export interface LockdownRule {
  action: LockdownAction;
  /** Escalate after this many events in the session (optional). */
  threshold?: number;
  severity?: 'info' | 'warn' | 'flag' | 'critical';
}

export interface LockdownTelemetryConfig {
  heartbeatSeconds: number;
  batchMaxEvents: number;
  batchMaxMs: number;
  offlineQueue: boolean;
}

export interface LockdownPolicy {
  version: number;
  mode: LockdownMode;
  requireFullscreen: boolean;
  maxFullscreenExits: number;
  graceSeconds: number;
  blockCopyPasteCut: boolean;
  blockContextMenu: boolean;
  blockPrint: boolean;
  blockDevToolsShortcuts: boolean;
  blockTextSelection: boolean;
  blockTabSwitch: boolean;
  maxTabSwitches: number;
  singleSessionOnly: boolean;
  multiMonitorPolicy: 'block' | 'warn' | 'allow';
  requireWebcam: boolean;
  requireMic: boolean;
  requireScreenShare: boolean;
  browserIntegrity: BrowserIntegrityMode;
  rules: Partial<Record<LockdownRuleKey, LockdownRule>>;
  telemetry: LockdownTelemetryConfig;
}

export interface SignedLockdownPolicy {
  policy: LockdownPolicy;
  signature: string;
  exam_id: string;
  signed_at: string;
}

export type LockdownEventType =
  | 'visibility_hidden'
  | 'visibility_visible'
  | 'window_blur'
  | 'window_focus'
  | 'fullscreen_exit'
  | 'fullscreen_enter'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'context_menu'
  | 'print'
  | 'devtools_heuristic'
  | 'multi_monitor'
  | 'screen_share_ended'
  | 'track_muted'
  | 'track_ended'
  | 'heartbeat'
  | 'second_tab'
  | 'webdriver';

export interface LockdownEvent {
  type: LockdownEventType;
  occurred_at: string;
  seq: number;
  policy_version: number;
  confidence?: number;
  meta?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface LockdownBatch {
  session_id: string;
  policy_version: number;
  events: LockdownEvent[];
}

export interface LockdownBatchAck {
  accepted: number;
  duplicate: number;
  rejected?: number;
}

export const DEFAULT_LOCKDOWN_POLICY: LockdownPolicy = {
  version: 1,
  mode: 'STANDARD',
  requireFullscreen: true,
  maxFullscreenExits: 3,
  graceSeconds: 5,
  blockCopyPasteCut: true,
  blockContextMenu: true,
  blockPrint: true,
  blockDevToolsShortcuts: true,
  blockTextSelection: false,
  blockTabSwitch: true,
  maxTabSwitches: 5,
  singleSessionOnly: true,
  multiMonitorPolicy: 'warn',
  requireWebcam: true,
  requireMic: false,
  requireScreenShare: false,
  browserIntegrity: 'none',
  rules: {
    fullscreenExit: { action: 'WARN', threshold: 3, severity: 'flag' },
    tabSwitch: { action: 'WARN', threshold: 5, severity: 'flag' },
    windowBlur: { action: 'WARN', severity: 'warn' },
    copyPaste: { action: 'WARN', severity: 'warn' },
    screenShareStopped: { action: 'PAUSE_EXAM', severity: 'critical' },
    cameraBlocked: { action: 'PAUSE_EXAM', severity: 'critical' },
    heartbeatMissed: { action: 'LOG', threshold: 3, severity: 'warn' },
    secondSession: { action: 'AUTO_TERMINATE', severity: 'critical' },
    webdriver: { action: 'AUTO_TERMINATE', severity: 'critical' },
  },
  telemetry: {
    heartbeatSeconds: 15,
    batchMaxEvents: 20,
    batchMaxMs: 5000,
    offlineQueue: true,
  },
};
