export { LockdownEnforcer } from './LockdownEnforcer';
export type { ViolationReason, LockdownOptions } from './LockdownEnforcer';
export { KeyboardInterceptor } from './KeyboardInterceptor';
export { VisibilityMonitor } from './VisibilityMonitor';
export { WindowFocusMonitor } from './WindowFocusMonitor';
export { ScreenCaptureBlocker } from './ScreenCaptureBlocker';
export { ExternalAppDetector } from './ExternalAppDetector';
export { NetworkMonitor } from './NetworkMonitor';
export type { NetworkSnapshot } from './NetworkMonitor';
export { KeystrokeAnalyzer } from './KeystrokeAnalyzer';
export type { KeystrokeAnomaly } from './KeystrokeAnalyzer';
// Phase 4: signed-policy lockdown client (detect + batch + heartbeat). Honest scope: see policy.ts.
export { LockdownClient, createFetchTransport } from './client';
export type {
  LockdownTransport,
  LockdownClientOptions,
  MonitoredTrackKind,
  SequenceStore,
} from './client';
export type {
  LockdownMode,
  LockdownAction,
  LockdownRule,
  LockdownRuleKey,
  LockdownPolicy,
  LockdownTelemetryConfig,
  BrowserIntegrityMode,
  SignedLockdownPolicy,
  LockdownEvent,
  LockdownEventType,
  LockdownBatch,
  LockdownBatchAck,
} from './policy';
export { canonicalJson, signableDocument, signPolicy, verifyPolicy } from './sign';
export { getKioskBridge, looksLikeSafeExamBrowser } from './kioskBridge';
export type { KioskBridge, KioskAttestation, KioskDisplayInfo } from './kioskBridge';
