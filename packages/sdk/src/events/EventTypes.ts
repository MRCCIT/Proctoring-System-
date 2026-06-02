export type SdkEventType =
  | 'session.initialized'
  | 'violation.detected'
  | 'identity.verified'
  | 'stream.started'
  | 'session.ended';

export interface SdkViolationEvent {
  type: string;
  severity: 'info' | 'warn' | 'flag' | 'terminate';
  payload?: Record<string, unknown>;
  occurred_at?: string;
}
