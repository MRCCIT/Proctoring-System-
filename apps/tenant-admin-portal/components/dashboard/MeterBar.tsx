'use client';

export function MeterBar(props: { label: string; value: string; percent: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, props.percent));
  const color = props.color || '#3b82f6';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
        <span style={{ color: '#475569', fontWeight: 500 }}>{props.label}</span>
        <span style={{ color: '#0f172a', fontWeight: 600 }}>{props.value}</span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 999,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}
