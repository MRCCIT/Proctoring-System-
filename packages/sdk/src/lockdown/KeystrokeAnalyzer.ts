export interface KeystrokeAnomaly {
  reason: 'paste_burst' | 'high_velocity' | 'long_pause' | 'auto_input';
  details?: Record<string, unknown>;
}

/**
 * Watches keyboard cadence on the exam page. Doesn't capture content
 * (privacy-friendly) — only timing patterns. Reports anomalies via callback.
 */
export class KeystrokeAnalyzer {
  private times: number[] = [];
  private onAnomaly: ((a: KeystrokeAnomaly) => void) | null = null;
  private kdHandler: ((e: KeyboardEvent) => void) | null = null;
  private pasteHandler: ((e: ClipboardEvent) => void) | null = null;
  private lastReport = 0;

  start(onAnomaly: (a: KeystrokeAnomaly) => void) {
    this.onAnomaly = onAnomaly;
    this.kdHandler = (e) => this.onKey(e);
    this.pasteHandler = (e) => this.onPaste(e);
    window.addEventListener('keydown', this.kdHandler, true);
    window.addEventListener('paste', this.pasteHandler, true);
  }

  private onKey(_e: KeyboardEvent) {
    const now = performance.now();
    this.times.push(now);
    if (this.times.length > 60) this.times.shift();
    if (this.times.length >= 30) {
      const intervals = this.times.slice(1).map((t, i) => t - this.times[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avg < 30 && now - this.lastReport > 5000) {
        this.lastReport = now;
        this.onAnomaly?.({ reason: 'high_velocity', details: { avg_ms: Math.round(avg) } });
      }
      if (avg > 30_000 && now - this.lastReport > 30_000) {
        this.lastReport = now;
        this.onAnomaly?.({ reason: 'long_pause', details: { avg_ms: Math.round(avg) } });
      }
    }
  }

  private onPaste(_e: ClipboardEvent) {
    this.onAnomaly?.({ reason: 'paste_burst' });
  }

  stop() {
    if (this.kdHandler) window.removeEventListener('keydown', this.kdHandler, true);
    if (this.pasteHandler) window.removeEventListener('paste', this.pasteHandler, true);
    this.kdHandler = null;
    this.pasteHandler = null;
    this.onAnomaly = null;
  }
}
