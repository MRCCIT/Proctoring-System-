export interface NetworkSnapshot {
  online: boolean;
  rtt_ms: number | null;
  downlink_mbps: number | null;
  effective_type: string | null;
  ts: number;
}

/**
 * Periodically measures connectivity. Reports offline transitions and bad
 * connections. Uses Network Information API where supported and a
 * lightweight HEAD fetch fallback so latency can be sampled in Safari/Firefox.
 */
export class NetworkMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(s: NetworkSnapshot) => void>();
  private lastOnline = navigator.onLine;

  start(intervalMs = 15_000, probeUrl?: string) {
    const handler = (online: boolean) => () => {
      this.lastOnline = online;
      this.emit({ online, rtt_ms: null, downlink_mbps: null, effective_type: null, ts: Date.now() });
    };
    const off = handler(false);
    const on = handler(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    this.timer = setInterval(async () => {
      const snap = await this.probe(probeUrl);
      this.emit(snap);
    }, intervalMs);
    void this.probe(probeUrl).then((s) => this.emit(s));
    (this as unknown as { _detach: () => void })._detach = () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }

  on(fn: (s: NetworkSnapshot) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(s: NetworkSnapshot) {
    this.listeners.forEach((fn) => fn(s));
  }

  private async probe(probeUrl?: string): Promise<NetworkSnapshot> {
    const c = (navigator as Navigator & { connection?: { rtt?: number; downlink?: number; effectiveType?: string } })
      .connection;
    let rtt = c?.rtt ?? null;
    if (probeUrl && (rtt == null || !rtt)) {
      const t = performance.now();
      try {
        await fetch(probeUrl, { method: 'HEAD', cache: 'no-store' });
        rtt = Math.round(performance.now() - t);
      } catch {
        rtt = null;
      }
    }
    return {
      online: navigator.onLine,
      rtt_ms: rtt,
      downlink_mbps: c?.downlink ?? null,
      effective_type: c?.effectiveType ?? null,
      ts: Date.now(),
    };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    (this as unknown as { _detach?: () => void })._detach?.();
  }
}
