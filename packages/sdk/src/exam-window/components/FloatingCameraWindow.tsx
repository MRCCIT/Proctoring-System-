'use client';

import { useEffect, useRef, useState } from 'react';

export interface FloatingCameraWindowProps {
  stream: MediaStream | null;
  /** Hide camera while keeping it active */
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  /** Indicator label shown next to REC dot */
  statusLabel?: string;
  /** Show a red REC dot */
  recording?: boolean;
  /** Optional override for initial position */
  initial?: { x: number; y: number };
  /** Optional override for default size */
  size?: { width: number; height: number };
  /** Branding color, used as accent for the chrome */
  accentColor?: string;
}

/**
 * Draggable, always-on-top camera PiP. Stays visible while the candidate
 * navigates the exam content. Uses position: fixed so it floats above iframes.
 *
 * Important: the <video> stays mounted while minimized so srcObject is not lost.
 * Unmounting on collapse left a blank feed on restore (stream prop unchanged → no rebind).
 */
export function FloatingCameraWindow(props: FloatingCameraWindowProps) {
  const {
    stream,
    collapsed = false,
    onCollapseChange,
    statusLabel,
    recording,
    initial = { x: typeof window !== 'undefined' && window.innerWidth ? window.innerWidth - 220 : 24, y: 80 },
    size = { width: 200, height: 160 },
    accentColor = '#dc2626',
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(initial);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => {});
  }, [stream, collapsed]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragging.current.dx));
      const y = Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragging.current.dy));
      setPos({ x, y });
    };
    const up = () => {
      dragging.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [size.width, size.height]);

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={() => onCollapseChange?.(false)}
          style={{
            position: 'fixed',
            top: pos.y,
            left: pos.x,
            zIndex: 2147483646,
            padding: '6px 10px',
            background: '#0f172a',
            color: '#f8fafc',
            border: `2px solid ${accentColor}`,
            borderRadius: 999,
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'system-ui',
          }}
          aria-label="Show proctoring camera"
        >
          {recording ? <span style={{ color: accentColor }}>● REC</span> : '◯'} Proctor
        </button>
      ) : null}

      <div
        ref={containerRef}
        aria-hidden={collapsed}
        style={{
          position: 'fixed',
          top: pos.y,
          left: pos.x,
          width: size.width,
          height: size.height + 28,
          zIndex: 2147483646,
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          fontFamily: 'system-ui',
          border: `2px solid ${accentColor}`,
          userSelect: 'none',
          // Keep mounted while minimized so the MediaStream stays attached.
          visibility: collapsed ? 'hidden' : 'visible',
          pointerEvents: collapsed ? 'none' : 'auto',
          // Park off-screen while collapsed so it cannot cover the pill button.
          transform: collapsed ? 'translate(-10000px, -10000px)' : undefined,
        }}
      >
        <div
          onMouseDown={onMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            background: '#020617',
            cursor: 'grab',
            fontSize: 11,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {recording ? (
              <span style={{ width: 8, height: 8, borderRadius: 4, background: accentColor, display: 'inline-block' }} />
            ) : (
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#475569', display: 'inline-block' }} />
            )}
            {statusLabel || 'Proctoring'}
          </span>
          <button
            type="button"
            onClick={() => onCollapseChange?.(true)}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Minimize camera"
          >
            —
          </button>
        </div>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: size.height, objectFit: 'cover', background: '#000' }}
        />
      </div>
    </>
  );
}
