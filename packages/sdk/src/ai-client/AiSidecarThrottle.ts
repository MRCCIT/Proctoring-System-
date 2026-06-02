/**
 * Per-session throttle + circuit breaker for the Python AI sidecar.
 *
 * Rules of thumb for ~50k concurrent candidates:
 *   - never escalate more than once per `minIntervalMs` per session per channel
 *   - if the sidecar fails `failureThreshold` times in a row, pause all calls
 *     for `cooldownMs` so a flaky sidecar can't get hammered
 *   - allow opportunistic escalation when something looks suspicious locally,
 *     but still honor the throttle
 */
export interface AiSidecarThrottleOptions {
  /** Minimum gap between calls for the same channel; default 30s */
  minIntervalMs?: number;
  /** Consecutive failures before tripping the breaker; default 3 */
  failureThreshold?: number;
  /** How long the breaker stays open; default 60s */
  cooldownMs?: number;
}

export class AiSidecarThrottle {
  private nextAllowedAt = new Map<string, number>();
  private failures = 0;
  private openedAt = 0;

  private readonly minIntervalMs: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(opts: AiSidecarThrottleOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 30_000;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
  }

  /** Returns true if a call on `channel` may proceed now. */
  allow(channel: string): boolean {
    const now = Date.now();
    if (this.openedAt && now - this.openedAt < this.cooldownMs) return false;
    if (this.openedAt && now - this.openedAt >= this.cooldownMs) {
      this.openedAt = 0;
      this.failures = 0;
    }
    const next = this.nextAllowedAt.get(channel) ?? 0;
    return now >= next;
  }

  /** Records that a call has been issued so we don't double-fire. */
  reserve(channel: string) {
    this.nextAllowedAt.set(channel, Date.now() + this.minIntervalMs);
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = 0;
  }

  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = Date.now();
  }

  get state(): { open: boolean; failures: number; cooldownRemainingMs: number } {
    const now = Date.now();
    const open = Boolean(this.openedAt && now - this.openedAt < this.cooldownMs);
    return {
      open,
      failures: this.failures,
      cooldownRemainingMs: open ? this.cooldownMs - (now - this.openedAt) : 0,
    };
  }
}
