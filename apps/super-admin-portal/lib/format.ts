export function formatCount(n: number | string | undefined): string {
  const v = typeof n === 'string' ? parseInt(n, 10) : Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString();
}

export function formatBytes(bytes: number | string | undefined): string {
  const b = typeof bytes === 'string' ? Number(bytes) : Number(bytes);
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(2)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  return `${(b / 1024 ** 4).toFixed(2)} TB`;
}

export function formatPercent(n: number | string | null | undefined, digits = 2): string {
  const v = typeof n === 'string' ? Number(n) : Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

/** Pretty-print probe/detail objects: byte fields → KB/MB/GB/TB, floats → 2 decimals. */
export function formatProbeDetails(details: unknown): string {
  if (details == null) return '{}';
  try {
    return JSON.stringify(sanitizeProbeValue(details), null, 2);
  } catch {
    return String(details);
  }
}

const BYTE_KEY =
  /(bytes|byte|size|rss|heap|memory|mem_used|mem_total|storage|egress|used_memory|maxmemory|disk_used|disk_total|ram_used|ram_total)$/i;

function sanitizeProbeValue(value: unknown, keyHint = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => sanitizeProbeValue(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeProbeValue(v, k);
    }
    return out;
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) && BYTE_KEY.test(keyHint)) {
    return formatBytes(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (BYTE_KEY.test(keyHint) && value >= 0) return formatBytes(value);
    if (keyHint.toLowerCase().includes('pct') || keyHint.toLowerCase().endsWith('_percent')) {
      return Number(value.toFixed(2));
    }
    if (!Number.isInteger(value)) return Number(value.toFixed(2));
    return value;
  }
  return value;
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Local calendar YYYY-MM-DD (avoids UTC day-shift from toISOString). */
export function toLocalDayKey(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDayShort(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '?';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const s = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export function formatOffset(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const s = Math.max(0, Math.floor(Number(seconds)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return formatDateTime(iso);
}

export function decisionLabel(decision: string | null | undefined): string {
  if (!decision) return '';
  if (decision === 'cleared') return 'Cleared';
  if (decision === 'flagged') return 'Flagged';
  if (decision === 'inconclusive') return 'Inconclusive';
  return decision;
}

export function pct(rate: number | null | undefined, digits = 0): string {
  if (rate == null || !Number.isFinite(Number(rate))) return '—';
  return `${(Number(rate) * 100).toFixed(digits)}%`;
}

export function humanizeCode(code: string | null | undefined): string {
  if (!code) return '—';
  return String(code)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
