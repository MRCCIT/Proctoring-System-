/**
 * Tier-2 live monitoring: adaptive JPEG/WebP snapshots every 10–30s,
 * with burst on violation. Wall tiles should only refresh visible candidates.
 */

export const SNAPSHOT_MIN_MS = 10_000;
export const SNAPSHOT_MAX_MS = 30_000;

export interface SnapshotUploadResult {
  ok: boolean;
  url?: string;
}

export interface SnapshotTickerOptions {
  capture: () => Promise<Blob | string | null>;
  upload: (payload: Blob | string, meta: { reason: 'tick' | 'burst'; intervalMs: number }) => Promise<SnapshotUploadResult>;
  /** Base interval before jitter; clamped to [SNAPSHOT_MIN_MS, SNAPSHOT_MAX_MS]. */
  intervalMs?: number;
  /** 0..1 — higher load → slower ticks. */
  loadFactor?: number;
}

export function clampSnapshotInterval(ms: number): number {
  return Math.min(SNAPSHOT_MAX_MS, Math.max(SNAPSHOT_MIN_MS, Math.round(ms)));
}

/** Apply load factor + small jitter so 100k clients don't sync. */
export function localIntervalMs(baseMs: number, loadFactor = 0): number {
  const slowed = baseMs * (1 + Math.min(1, Math.max(0, loadFactor)) * 2);
  const clamped = clampSnapshotInterval(slowed);
  const jitter = clamped * (0.85 + Math.random() * 0.3);
  return Math.round(jitter);
}

export class SnapshotTicker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly opts: SnapshotTickerOptions;

  constructor(opts: SnapshotTickerOptions) {
    this.opts = opts;
  }

  start() {
    this.stopped = false;
    this.schedule();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async burst() {
    await this.tick('burst');
  }

  private schedule() {
    if (this.stopped) return;
    const base = this.opts.intervalMs ?? 20_000;
    const ms = localIntervalMs(base, this.opts.loadFactor ?? 0);
    this.timer = setTimeout(() => void this.tick('tick'), ms);
  }

  private async tick(reason: 'tick' | 'burst') {
    try {
      const payload = await this.opts.capture();
      if (payload) {
        await this.opts.upload(payload, {
          reason,
          intervalMs: this.opts.intervalMs ?? 20_000,
        });
      }
    } catch {
      /* best-effort */
    } finally {
      if (reason === 'tick') this.schedule();
    }
  }
}
