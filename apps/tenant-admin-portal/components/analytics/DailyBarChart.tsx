'use client';

import type { CSSProperties } from 'react';

export interface DailyBarSeries {
  key: string;
  label: string;
  color: string;
}

export interface DailyBarDay {
  key: string;
  label: string;
  title: string;
  values: Record<string, number>;
}

export interface DailyBarChartProps {
  days: DailyBarDay[];
  /** Grouped: drawn left to right. Stacked: drawn bottom to top. */
  series: DailyBarSeries[];
  mode: 'grouped' | 'stacked';
  height?: number;
  labelEvery?: number;
}

const MIN_BAR_PX = 4;

function niceMax(value: number): number {
  if (value <= 1) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= step * exp) return step * exp;
  }
  return 10 * exp;
}

function formatTick(n: number): string {
  if (!Number.isInteger(n)) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n);
}

function pct(value: number, max: number) {
  return `${Math.min(100, (value / max) * 100)}%`;
}

export function DailyBarChart({ days, series, mode, height = 180, labelEvery = 5 }: DailyBarChartProps) {
  const n = days.length;
  const peak = Math.max(
    0,
    ...days.map((d) =>
      mode === 'stacked'
        ? series.reduce((sum, s) => sum + (d.values[s.key] || 0), 0)
        : Math.max(0, ...series.map((s) => d.values[s.key] || 0)),
    ),
  );
  const max = niceMax(peak);
  const columns = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  return (
    <div className="ps-dbc" style={{ '--dbc-h': `${height}px` } as CSSProperties}>
      <div className="ps-dbc-yaxis" aria-hidden>
        <span style={{ top: 0 }}>{formatTick(max)}</span>
        <span style={{ top: '50%' }}>{formatTick(max / 2)}</span>
        <span style={{ top: '100%' }}>0</span>
      </div>

      <div className="ps-dbc-plot" style={columns} role="img" aria-label="Daily bar chart">
        <div className="ps-dbc-gridline" style={{ top: 0 }} aria-hidden />
        <div className="ps-dbc-gridline" style={{ top: '50%' }} aria-hidden />
        {days.map((d, i) => {
          const total = series.reduce((sum, s) => sum + (d.values[s.key] || 0), 0);
          const tallest =
            mode === 'stacked' ? total : Math.max(0, ...series.map((s) => d.values[s.key] || 0));
          const edge = i < 2 ? ' is-start' : i > n - 3 ? ' is-end' : '';
          return (
            <div className="ps-dbc-col" key={d.key} title={d.title}>
              {mode === 'grouped' ? (
                <div className="ps-dbc-group">
                  {series.map((s) => {
                    const v = d.values[s.key] || 0;
                    return (
                      <div className="ps-dbc-slot" key={s.key}>
                        {v > 0 && (
                          <div
                            className="ps-dbc-bar"
                            style={{ height: pct(v, max), minHeight: MIN_BAR_PX, background: s.color }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ps-dbc-stack">
                  {series.map((s) => {
                    const v = d.values[s.key] || 0;
                    if (v <= 0) return null;
                    return (
                      <div
                        key={s.key}
                        className="ps-dbc-bar"
                        style={{ height: pct(v, max), minHeight: MIN_BAR_PX, background: s.color }}
                      />
                    );
                  })}
                </div>
              )}
              {total > 0 && (
                <span
                  className={`ps-dbc-tip${edge}`}
                  style={{ bottom: `min(calc(${pct(tallest, max)} + 6px), calc(100% + 4px))` }}
                >
                  {series
                    .filter((s) => (d.values[s.key] || 0) > 0)
                    .map((s) => (
                      <span key={s.key} className="ps-dbc-tip-item">
                        <i style={{ background: s.color }} />
                        {d.values[s.key]}
                      </span>
                    ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div aria-hidden />
      <div className="ps-dbc-axis" style={columns} aria-hidden>
        {days.map((d, i) => {
          const show = (n - 1 - i) % labelEvery === 0;
          const edge = i === n - 1 ? ' is-end' : i === 0 ? ' is-start' : '';
          return (
            <span key={d.key} className={`ps-dbc-tick${edge}`}>
              {show ? d.label : ''}
            </span>
          );
        })}
      </div>

      <div aria-hidden />
      <div className="ps-legend">
        {(mode === 'stacked' ? [...series].reverse() : series).map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
