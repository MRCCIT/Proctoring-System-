/**
 * Signed-policy lockdown client: detect → batch → heartbeat.
 * Defense in depth only — browsers cannot be fully locked.
 */

import {
  DEFAULT_LOCKDOWN_POLICY,
  type LockdownBatch,
  type LockdownBatchAck,
  type LockdownEvent,
  type LockdownEventType,
  type LockdownPolicy,
  type SignedLockdownPolicy,
} from './policy';

export interface LockdownTransport {
  postEvents(batch: LockdownBatch): Promise<LockdownBatchAck>;
}

export interface SequenceStore {
  next(): number;
  peek(): number;
}

export type MonitoredTrackKind = 'camera' | 'mic' | 'screen';

export interface LockdownClientOptions {
  sessionId: string;
  policy: LockdownPolicy;
  transport: LockdownTransport;
  sequence?: SequenceStore;
  onLocalAction?: (action: string, event: LockdownEvent) => void;
}

function memorySequence(start = 1): SequenceStore {
  let n = start;
  return {
    next: () => n++,
    peek: () => n,
  };
}

export function createFetchTransport(opts: {
  baseUrl: string;
  sessionId: string;
  getToken: () => string | null | undefined;
  /** Prefer candidate SDK path (session token). Default true. */
  useSdkPath?: boolean;
}): LockdownTransport {
  const base = opts.baseUrl.replace(/\/$/, '');
  const useSdk = opts.useSdkPath !== false;
  return {
    async postEvents(batch) {
      const token = opts.getToken();
      const path = useSdk
        ? `/v1/sdk/sessions/${opts.sessionId}/lockdown-events`
        : `/v1/sessions/${opts.sessionId}/lockdown-events`;
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Session-Token': token } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`lockdown-events ${res.status}`);
      return (await res.json()) as LockdownBatchAck;
    },
  };
}

export class LockdownClient {
  private readonly sessionId: string;
  private readonly policy: LockdownPolicy;
  private readonly transport: LockdownTransport;
  private readonly seq: SequenceStore;
  private readonly onLocalAction?: LockdownClientOptions['onLocalAction'];
  private queue: LockdownEvent[] = [];
  private started = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(opts: LockdownClientOptions) {
    this.sessionId = opts.sessionId;
    this.policy = opts.policy;
    this.transport = opts.transport;
    this.seq = opts.sequence || memorySequence();
    this.onLocalAction = opts.onLocalAction;
  }

  static fromSigned(signed: SignedLockdownPolicy, opts: Omit<LockdownClientOptions, 'policy'>) {
    return new LockdownClient({ ...opts, policy: signed.policy });
  }

  start() {
    if (this.started || this.policy.mode === 'OFF') return;
    this.started = true;
    if (typeof document !== 'undefined') {
      const onVis = () => this.push(document.hidden ? 'visibility_hidden' : 'visibility_visible');
      document.addEventListener('visibilitychange', onVis);
      this.unsubscribers.push(() => document.removeEventListener('visibilitychange', onVis));

      const onBlur = () => this.push('window_blur');
      const onFocus = () => this.push('window_focus');
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      this.unsubscribers.push(() => {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      });

      if (this.policy.blockCopyPasteCut) {
        const block = (type: LockdownEventType) => (ev: Event) => {
          ev.preventDefault();
          this.push(type);
        };
        document.addEventListener('copy', block('copy'));
        document.addEventListener('cut', block('cut'));
        document.addEventListener('paste', block('paste'));
        this.unsubscribers.push(() => {
          document.removeEventListener('copy', block('copy') as EventListener);
        });
      }

      if (this.policy.blockContextMenu) {
        const onCtx = (ev: Event) => {
          ev.preventDefault();
          this.push('context_menu');
        };
        document.addEventListener('contextmenu', onCtx);
        this.unsubscribers.push(() => document.removeEventListener('contextmenu', onCtx));
      }

      document.addEventListener('fullscreenchange', () => {
        this.push(document.fullscreenElement ? 'fullscreen_enter' : 'fullscreen_exit');
      });
    }

    if (typeof BroadcastChannel !== 'undefined' && this.policy.singleSessionOnly) {
      this.channel = new BroadcastChannel(`ps-lockdown:${this.sessionId}`);
      this.channel.onmessage = () => this.push('second_tab');
      this.channel.postMessage({ t: 'hello', at: Date.now() });
    }

    if (typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver) {
      this.push('webdriver', 1);
    }

    const hb = Math.max(5, this.policy.telemetry?.heartbeatSeconds || 15) * 1000;
    this.heartbeatTimer = setInterval(() => this.push('heartbeat', 1), hb);
  }

  stop() {
    this.started = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.channel?.close();
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    void this.flush();
  }

  observeTrack(track: MediaStreamTrack, kind: MonitoredTrackKind) {
    const onMute = () => this.push('track_muted', 0.8, { kind });
    const onEnded = () => {
      this.push(kind === 'screen' ? 'screen_share_ended' : 'track_ended', 1, { kind });
    };
    track.addEventListener('mute', onMute);
    track.addEventListener('ended', onEnded);
    this.unsubscribers.push(() => {
      track.removeEventListener('mute', onMute);
      track.removeEventListener('ended', onEnded);
    });
  }

  private push(type: LockdownEventType, confidence = 0.9, meta?: Record<string, unknown>) {
    const event: LockdownEvent = {
      type,
      occurred_at: new Date().toISOString(),
      seq: this.seq.next(),
      policy_version: this.policy.version,
      confidence,
      meta,
      idempotency_key: `${this.sessionId}:${this.seq.peek() - 1}:${type}`,
    };
    this.queue.push(event);
    const ruleKey = mapTypeToRule(type);
    const rule = ruleKey
      ? this.policy.rules?.[ruleKey] || DEFAULT_LOCKDOWN_POLICY.rules[ruleKey]
      : undefined;
    if (rule?.action && rule.action !== 'LOG') this.onLocalAction?.(rule.action, event);

    const maxN = this.policy.telemetry?.batchMaxEvents || 20;
    const maxMs = this.policy.telemetry?.batchMaxMs || 5000;
    if (this.queue.length >= maxN) void this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), maxMs);
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.queue.length) return;
    const events = this.queue.splice(0, this.queue.length);
    try {
      await this.transport.postEvents({
        session_id: this.sessionId,
        policy_version: this.policy.version,
        events,
      });
    } catch {
      // Re-queue for retry (best-effort offline tolerance).
      this.queue.unshift(...events);
    }
  }
}

function mapTypeToRule(type: LockdownEventType) {
  switch (type) {
    case 'fullscreen_exit':
      return 'fullscreenExit' as const;
    case 'visibility_hidden':
    case 'second_tab':
      return 'tabSwitch' as const;
    case 'window_blur':
      return 'windowBlur' as const;
    case 'copy':
    case 'paste':
    case 'cut':
      return 'copyPaste' as const;
    case 'context_menu':
      return 'contextMenu' as const;
    case 'print':
      return 'print' as const;
    case 'devtools_heuristic':
      return 'devtools' as const;
    case 'multi_monitor':
      return 'multiMonitor' as const;
    case 'screen_share_ended':
      return 'screenShareStopped' as const;
    case 'track_muted':
    case 'track_ended':
      return 'cameraBlocked' as const;
    case 'heartbeat':
      // Periodic keepalive telemetry — not a missed-heartbeat violation.
      return null;
    case 'webdriver':
      return 'webdriver' as const;
    default:
      return null;
  }
}
