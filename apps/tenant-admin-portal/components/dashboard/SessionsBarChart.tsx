'use client';

import { formatDayShort } from '@/lib/format';

export interface SessionsBarChartProps {
  data: Array<{ day: string; sessions: number }>;
  height?: number;
}

export function SessionsBarChart({ data, height = 200 }: SessionsBarChartProps) {
  const points = data.length ? data : [{ day: new Date().toISOString(), sessions: 0 }];
  const max = Math.max(1, ...points.map((p) => p.sessions));
  const total = points.reduce((s, p) => s + p.sessions, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          <strong style={{ color: '#0f172a', fontSize: 20 }}>{total}</strong> sessions in period
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Last {points.length} days with activity</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          height,
          padding: '8px 0 0',
          borderBottom: '1px solid #e2e8f0',
        }}
        role="img"
        aria-label="Sessions per day bar chart"
      >
        {points.map((p) => {
          const pct = (p.sessions / max) * 100;
          return (
            <div
              key={p.day}
              title={`${formatDayShort(p.day)}: ${p.sessions} session${p.sessions === 1 ? '' : 's'}`}
              style={{
                flex: 1,
                minWidth: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>{p.sessions || ''}</span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 48,
                  height: `${Math.max(p.sessions ? 8 : 2, pct)}%`,
                  minHeight: p.sessions ? 8 : 2,
                  background: p.sessions > 0 ? 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)' : '#e2e8f0',
                  borderRadius: '6px 6px 2px 2px',
                }}
              />
              <span style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
                {formatDayShort(p.day)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
