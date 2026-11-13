'use client';

export type SessionControlKind = 'paused' | 'resumed' | 'terminated';

export interface SessionControlOverlayProps {
  kind: SessionControlKind;
  message?: string;
  brandPrimary?: string;
  accentColor?: string;
  onAcknowledge?: () => void;
}

const COPY: Record<
  SessionControlKind,
  { title: string; defaultMessage: string; tone: string; bg: string; border: string; button: string }
> = {
  paused: {
    title: 'Exam paused',
    defaultMessage: 'Your proctor has paused this exam. Please wait — you cannot continue until the exam is resumed.',
    tone: '#9a3412',
    bg: '#fff7ed',
    border: '#fdba74',
    button: 'Waiting for proctor…',
  },
  resumed: {
    title: 'Exam resumed',
    defaultMessage: 'Your proctor has resumed the exam. You may continue.',
    tone: '#166534',
    bg: '#f0fdf4',
    border: '#86efac',
    button: 'Continue exam',
  },
  terminated: {
    title: 'Exam terminated',
    defaultMessage: 'Your proctor has ended this exam session. You can no longer continue.',
    tone: '#991b1b',
    bg: '#fef2f2',
    border: '#fecaca',
    button: 'Close session',
  },
};

/**
 * Full-screen candidate popup for proctor pause / resume / terminate commands.
 */
export function SessionControlOverlay(props: SessionControlOverlayProps) {
  const { kind, message, brandPrimary = '#0f172a', onAcknowledge } = props;
  const copy = COPY[kind];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ps-session-control-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483645,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 24px 48px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          border: `1px solid ${copy.border}`,
        }}
      >
        <div style={{ background: copy.bg, borderBottom: `1px solid ${copy.border}`, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: copy.tone }}>
            ProctorShield
          </div>
          <h2 id="ps-session-control-title" style={{ margin: '6px 0 0', fontSize: 20, color: brandPrimary }}>
            {copy.title}
          </h2>
        </div>
        <div style={{ padding: '18px 20px 20px' }}>
          <p style={{ margin: 0, color: '#334155', lineHeight: 1.55, fontSize: 14.5 }}>
            {message?.trim() || copy.defaultMessage}
          </p>
          {kind === 'paused' ? (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#64748b' }}>
              Keep this window open. Your proctor can message you in chat while paused.
            </p>
          ) : null}
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
            {kind === 'paused' ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#d97706',
                    boxShadow: '0 0 0 4px rgba(217,119,6,0.2)',
                  }}
                />
                {copy.button}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAcknowledge?.()}
                style={{
                  background: kind === 'terminated' ? '#dc2626' : brandPrimary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copy.button}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
