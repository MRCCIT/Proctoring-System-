'use client';

export interface ProctoringIndicatorProps {
  recording: boolean;
  sessionId?: string | null;
  violations: number;
  online: boolean;
  brandPrimary?: string;
  paused?: boolean;
  /** Last unified Python AI tick summary */
  aiStatus?: { ok: boolean; label: string } | null;
}

export function ProctoringIndicator(props: ProctoringIndicatorProps) {
  const { recording, sessionId, violations, online, brandPrimary = '#0f172a', paused, aiStatus } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 999,
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        position: 'sticky',
        top: 12,
        zIndex: 10,
        width: 'fit-content',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: paused ? '#d97706' : recording ? '#dc2626' : '#94a3b8',
          display: 'inline-block',
        }}
      />
      <strong style={{ color: brandPrimary }}>{paused ? 'PAUSED' : recording ? 'RECORDING' : 'IDLE'}</strong>
      <span style={{ color: '#64748b' }}>{online ? 'Online' : 'Offline'}</span>
      <span style={{ color: violations > 0 ? '#b91c1c' : '#16a34a' }}>
        {violations} violation{violations === 1 ? '' : 's'}
      </span>
      {aiStatus && (
        <span
          style={{
            color: aiStatus.ok ? '#15803d' : '#b45309',
            fontWeight: 600,
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={aiStatus.label}
        >
          AI: {aiStatus.label}
        </span>
      )}
      {sessionId && <span style={{ color: '#94a3b8' }}>#{sessionId.slice(0, 8)}</span>}
    </div>
  );
}
