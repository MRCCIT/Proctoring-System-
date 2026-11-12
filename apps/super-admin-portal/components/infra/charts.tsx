'use client';

import { formatBytes } from '@/lib/format';

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Compact clock label — never locale AM/PM strings that collide under bars. */
function clockLabel(iso?: string, withSeconds = false) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = pad2(d.getMinutes());
  if (!withSeconds) return `${h}:${m}`;
  return `${h}:${m}:${pad2(d.getSeconds())}`;
}

function axisSpanSeconds(points: { t?: string }[]) {
  const times = points.map((p) => (p.t ? new Date(p.t).getTime() : NaN)).filter((n) => Number.isFinite(n));
  if (times.length < 2) return 0;
  return Math.max(...times) - Math.min(...times);
}

function axisTicks(data: { t?: string; label?: string }[], withSeconds: boolean, tickCount = 3) {
  if (!data.length) return [] as { key: string; text: string }[];
  const n = Math.max(2, Math.min(tickCount, data.length));
  const idxs =
    data.length === 1
      ? [0]
      : Array.from({ length: n }, (_, i) => Math.round((i * (data.length - 1)) / (n - 1)));
  const seen = new Set<string>();
  const ticks: { key: string; text: string }[] = [];
  for (const i of idxs) {
    const text = data[i].label || clockLabel(data[i].t, withSeconds);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    ticks.push({ key: `${i}-${text}`, text });
  }
  return ticks;
}

function bucketPoints(
  points: { t?: string; v: number; label?: string }[],
  bucketMs: number
): { t?: string; v: number; label?: string }[] {
  if (!bucketMs || bucketMs <= 0 || points.length <= 1) return points;
  const buckets = new Map<number, { t: string; v: number }>();
  for (const p of points) {
    const ms = p.t ? new Date(p.t).getTime() : NaN;
    if (!Number.isFinite(ms)) continue;
    const key = Math.floor(ms / bucketMs) * bucketMs;
    const cur = buckets.get(key);
    if (cur) cur.v += Number(p.v) || 0;
    else buckets.set(key, { t: new Date(key).toISOString(), v: Number(p.v) || 0 });
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

function toneColor(v: number, thresholds?: { warn: number; critical: number }) {
  if (!thresholds) return null;
  if (v >= thresholds.critical) return '#dc2626'; // red
  if (v >= thresholds.warn) return '#d97706'; // amber
  return '#93c5fd'; // light blue — quiet
}

export function DynamicBarChart({
  points,
  colorClass = 'ps-bar-a',
  height = 140,
  valueSuffix = '',
  emptyLabel = 'No samples yet',
  maxBars = 16,
  tickCount = 3,
  thresholds,
  bucketMs,
  legend = false,
}: {
  points: { t?: string; v: number; label?: string }[];
  colorClass?: string;
  height?: number;
  valueSuffix?: string;
  emptyLabel?: string;
  /** Keep all points up to this count (daily charts pass 31). */
  maxBars?: number;
  tickCount?: number;
  /** Absolute thresholds for bar color + quiet visual scale. */
  thresholds?: { warn: number; critical: number };
  /** Sum samples into time buckets (ms) — use for per-request counters. */
  bucketMs?: number;
  legend?: boolean;
}) {
  const raw = bucketPoints(
    (points || []).filter((d) => Number.isFinite(Number(d.v))),
    bucketMs || 0
  );
  if (!raw.length) {
    return (
      <div className="ps-chart-empty" style={{ minHeight: height }}>
        {emptyLabel}
      </div>
    );
  }

  const data = downsample(raw, maxBars);
  const dataMax = Math.max(0, ...data.map((d) => Number(d.v) || 0));
  // Keep quiet traffic visually low when thresholds are set
  const max = Math.max(1, dataMax, thresholds ? thresholds.critical : 0);
  const withSeconds = axisSpanSeconds(data) > 0 && axisSpanSeconds(data) < 5 * 60 * 1000;
  const ticks = axisTicks(data, withSeconds, tickCount);
  const fmtMax = Number.isInteger(max) ? String(max) : max.toFixed(1);
  const fmtMid = (max / 2).toFixed(max >= 10 ? 0 : 1);

  return (
    <div className="ps-chart-wrap">
      <div className="ps-chart" style={{ ['--ps-chart-h' as string]: `${height}px` }}>
        <div className="ps-chart-y" aria-hidden>
          <span>
            {fmtMax}
            {valueSuffix}
          </span>
          <span>
            {fmtMid}
            {valueSuffix}
          </span>
          <span>0{valueSuffix}</span>
        </div>
        <div className="ps-chart-plot">
          <div className="ps-chart-bars" role="img" aria-label="Trend chart">
            {data.map((d, i) => {
              const v = Number(d.v) || 0;
              const pct = v <= 0 ? 0 : Math.max(3, (v / max) * 100);
              const tip = `${d.label || clockLabel(d.t, withSeconds)}: ${v}${valueSuffix}`;
              const fill = toneColor(v, thresholds);
              return (
                <div className="ps-chart-bar-slot" key={`${d.t || i}-${i}`} title={tip}>
                  {v > 0 ? (
                    <div
                      className={`ps-chart-bar${fill ? '' : ` ${colorClass}`}`}
                      style={{ height: `${pct}%`, ...(fill ? { background: fill } : null) }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="ps-chart-x">
            {ticks.map((t) => (
              <span key={t.key}>{t.text}</span>
            ))}
          </div>
        </div>
      </div>
      {legend && thresholds && (
        <div className="ps-chart-legend">
          <span>
            <i style={{ background: '#93c5fd' }} /> Quiet (&lt;{thresholds.warn})
          </span>
          <span>
            <i style={{ background: '#d97706' }} /> Elevated (≥{thresholds.warn})
          </span>
          <span>
            <i style={{ background: '#dc2626' }} /> High (≥{thresholds.critical})
          </span>
        </div>
      )}
    </div>
  );
}

export function ProbeDetailsPanel({ details }: { details: Record<string, unknown> | null | undefined }) {
  const entries = flattenProbe(details || {});
  if (!entries.length) {
    return <p className="ps-muted" style={{ margin: 0 }}>No probe details for this service.</p>;
  }
  return (
    <dl className="ps-probe-grid">
      {entries.map((row) => (
        <div key={row.key} className="ps-probe-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const BYTE_KEY =
  /(bytes|byte|size|rss|heap|memory|mem_used|mem_total|storage|egress|used_memory|maxmemory|disk_used|disk_total|ram_used|ram_total|heap_used)$/i;

function flattenProbe(obj: Record<string, unknown>, prefix = ''): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenProbe(v as Record<string, unknown>, key));
      continue;
    }
    if (Array.isArray(v)) {
      out.push({
        key,
        label: humanizeKey(key),
        value: v.every((x) => typeof x === 'number')
          ? v.map((x) => (Number.isInteger(x) ? String(x) : Number(x).toFixed(2))).join(' · ')
          : JSON.stringify(v),
      });
      continue;
    }
    out.push({ key, label: humanizeKey(key), value: formatProbeField(k, v) });
  }
  return out;
}

function humanizeKey(key: string) {
  return key
    .replace(/[_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatProbeField(key: string, value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (BYTE_KEY.test(key) && value >= 0) return formatBytes(value);
    if (key.toLowerCase().includes('pct')) return `${value.toFixed(2)}%`;
    if (key === 'uptime_s' || key.endsWith('_s')) {
      const s = Math.round(value);
      if (s < 60) return `${s}s`;
      if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
      return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    }
    if (key === 'latency_ms' || key.endsWith('_ms')) return `${Math.round(value)} ms`;
    if (!Number.isInteger(value)) return value.toFixed(2);
    return String(value);
  }
  if (typeof value === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(value) && BYTE_KEY.test(key)) return formatBytes(value);
    return value;
  }
  return String(value);
}

export function UtilizationMeter({
  label,
  value,
  max,
  unit,
  attribution,
  valueKind = 'number',
  hint,
}: {
  label: string;
  value: number | null | undefined;
  max?: number | null;
  unit?: string;
  attribution?: string;
  valueKind?: 'number' | 'bytes';
  hint?: string;
}) {
  const v = value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const m = max == null || !Number.isFinite(Number(max)) || Number(max) <= 0 ? null : Number(max);
  const pct = v != null && m != null ? Math.min(100, Math.round((v / m) * 1000) / 10) : null;
  const tone = pct == null ? '' : pct >= 90 ? 'ps-tone-danger' : pct >= 75 ? 'ps-tone-warning' : 'ps-tone-success';
  const fmt = (n: number) => (valueKind === 'bytes' ? formatBytes(n) : formatCompact(n));
  return (
    <div className={`ps-stat ${tone}`.trim()}>
      <div className="ps-stat-top">
        <span className="ps-stat-label">{label}</span>
        {attribution && (
          <span className="ps-muted" style={{ fontSize: 11 }}>
            {attribution}
          </span>
        )}
      </div>
      <div className="ps-stat-value" style={{ fontSize: 18 }}>
        {v == null ? '—' : fmt(v)}
        {m != null ? (
          <span className="ps-muted" style={{ fontSize: 13, fontWeight: 500 }}>
            {' '}
            / {fmt(m)}
          </span>
        ) : null}
      </div>
      {(unit || hint) && <div className="ps-stat-hint">{hint || unit}</div>}
      {pct != null && (
        <div className="ps-meter" style={{ marginTop: 10 }}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {pct != null && <div className="ps-stat-hint">{pct}% utilized</div>}
    </div>
  );
}

function formatCompact(n: number) {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function toneForStatus(status?: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  const s = String(status || '').toLowerCase();
  if (s === 'healthy' || s === 'up' || s === 'ok' || s === 'online') return 'success';
  if (s === 'degraded' || s === 'warn' || s === 'unavailable') return 'warning';
  if (s === 'unhealthy' || s === 'down' || s === 'error' || s === 'critical') return 'danger';
  return 'neutral';
}
