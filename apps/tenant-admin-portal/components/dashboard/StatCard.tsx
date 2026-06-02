'use client';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: string;
}

const ACCENT: Record<NonNullable<StatCardProps['accent']>, { border: string; bg: string; value: string }> = {
  default: { border: '#e2e8f0', bg: '#fff', value: '#0f172a' },
  success: { border: '#bbf7d0', bg: '#f0fdf4', value: '#15803d' },
  warning: { border: '#fde68a', bg: '#fffbeb', value: '#b45309' },
  danger: { border: '#fecaca', bg: '#fef2f2', value: '#b91c1c' },
  info: { border: '#bfdbfe', bg: '#eff6ff', value: '#1d4ed8' },
};

export function StatCard({ label, value, hint, accent = 'default', icon }: StatCardProps) {
  const c = ACCENT[accent];
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: '18px 20px',
        minHeight: 108,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {icon ? <span style={{ fontSize: 18 }} aria-hidden>{icon}</span> : null}
      </div>
      <span style={{ fontSize: 28, fontWeight: 700, color: c.value, lineHeight: 1.1 }}>{value}</span>
      {hint ? <span style={{ fontSize: 12, color: '#94a3b8' }}>{hint}</span> : null}
    </div>
  );
}
