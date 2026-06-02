'use client';

import { useEffect, useMemo, useState } from 'react';
import { PermissionManager, PermissionState } from '../../media/PermissionManager';

export interface PermissionGateProps {
  manager: PermissionManager;
  /** Set to false if you don't need screen capture (e.g. coding exams) */
  requireScreen?: boolean;
  brandPrimary?: string;
  onAllReady: (s: { camMicStream: MediaStream; screenStream: MediaStream | null }) => void;
}

const ITEM: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  marginBottom: 8,
  background: '#fff',
};

function badge(state: PermissionState[keyof PermissionState]) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    unknown: { bg: '#e2e8f0', fg: '#475569', label: 'Required' },
    pending: { bg: '#fde68a', fg: '#92400e', label: 'Asking…' },
    granted: { bg: '#bbf7d0', fg: '#166534', label: 'Granted' },
    denied: { bg: '#fecaca', fg: '#991b1b', label: 'Blocked' },
  };
  const m = map[state] || map.unknown;
  return (
    <span style={{ background: m.bg, color: m.fg, padding: '2px 10px', borderRadius: 999, fontSize: 12 }}>{m.label}</span>
  );
}

export function PermissionGate(props: PermissionGateProps) {
  const { manager, requireScreen = true, brandPrimary = '#0f172a', onAllReady } = props;
  const [state, setState] = useState<PermissionState>(manager.state);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'cammic' | 'screen' | null>(null);

  useEffect(() => {
    const off = manager.onChange(setState);
    void manager.queryStored();
    return () => {
      off();
    };
  }, [manager]);

  /** Permission toggles in the browser ≠ an active stream; acquire when already allowed. */
  useEffect(() => {
    if (state.camera !== 'granted' || state.microphone !== 'granted') return;
    if (manager.acquired.cameraAndMicStream?.getVideoTracks().some((t) => t.readyState === 'live')) {
      return;
    }
    void manager.requestCameraAndMic().catch((e) => {
      setError(
        `Could not open camera/microphone: ${(e as Error).message}. Click "Allow camera & microphone" or check site permissions.`
      );
    });
  }, [state.camera, state.microphone, manager]);

  const camMicLive = Boolean(
    manager.acquired.cameraAndMicStream?.getVideoTracks().some((t) => t.readyState === 'live')
  );
  const screenLive =
    !requireScreen ||
    Boolean(manager.acquired.screenStream?.getVideoTracks().some((t) => t.readyState === 'live'));

  const ready =
    state.camera === 'granted' &&
    state.microphone === 'granted' &&
    (!requireScreen || state.screen === 'granted') &&
    camMicLive &&
    screenLive;

  const askCamMic = async () => {
    setError(null);
    setBusy('cammic');
    try {
      await manager.requestCameraAndMic();
    } catch (e) {
      setError(`Camera/microphone blocked: ${(e as Error).message}. Allow access in the browser address bar and retry.`);
    } finally {
      setBusy(null);
    }
  };

  const askScreen = async () => {
    setError(null);
    setBusy('screen');
    try {
      await manager.requestScreen();
    } catch (e) {
      setError(`Screen share blocked: ${(e as Error).message}. Select "Entire screen" then click Share.`);
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!ready) return;
    let stream = manager.acquired.cameraAndMicStream;
    if (!stream?.getVideoTracks().length) {
      try {
        stream = await manager.requestCameraAndMic();
      } catch (e) {
        setError(`Camera/microphone blocked: ${(e as Error).message}`);
        return;
      }
    }
    onAllReady({
      camMicStream: stream,
      screenStream: manager.acquired.screenStream,
    });
  };

  const items = useMemo(
    () => [
      {
        key: 'camera',
        label: 'Camera',
        desc: 'Used for identity verification and live face presence checks every 10s.',
        state: state.camera,
        cta: 'Allow camera & microphone',
        onClick: askCamMic,
      },
      {
        key: 'microphone',
        label: 'Microphone',
        desc: 'Audio is monitored for background voices and noise during the exam.',
        state: state.microphone,
        cta: 'Allow camera & microphone',
        onClick: askCamMic,
      },
      requireScreen
        ? {
            key: 'screen',
            label: 'Screen share',
            desc: 'Choose "Entire Screen" so we can record evidence of your full activity.',
            state: state.screen,
            cta: 'Share entire screen',
            onClick: askScreen,
          }
        : null,
    ],
    [state, requireScreen]
  );

  return (
    <section style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>Allow proctoring access</h2>
      <p style={{ color: '#475569', marginBottom: 16, fontSize: 14 }}>
        Before the exam can start we need permission to use your camera, microphone, and screen.
      </p>
      {(items.filter(Boolean) as Array<NonNullable<(typeof items)[number]>>).map((it) => (
        <div key={it.key} style={ITEM}>
          <div style={{ paddingRight: 16 }}>
            <strong style={{ display: 'block' }}>{it.label}</strong>
            <span style={{ color: '#64748b', fontSize: 12 }}>{it.desc}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {badge(it.state)}
            {it.state !== 'granted' && (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void it.onClick()}
                style={{
                  background: brandPrimary,
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {busy === 'cammic' && (it.key === 'camera' || it.key === 'microphone')
                  ? 'Asking…'
                  : busy === 'screen' && it.key === 'screen'
                    ? 'Asking…'
                    : it.cta}
              </button>
            )}
          </div>
        </div>
      ))}
      {error && (
        <p style={{ color: '#b91c1c', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => void start()}
        style={{
          marginTop: 12,
          background: ready ? brandPrimary : '#cbd5e1',
          color: '#fff',
          border: 'none',
          padding: '10px 18px',
          borderRadius: 8,
          fontSize: 14,
          cursor: ready ? 'pointer' : 'not-allowed',
        }}
      >
        {ready
          ? 'Continue to system check'
          : state.camera === 'granted' && state.microphone === 'granted' && !camMicLive
            ? 'Starting camera…'
            : 'Awaiting permissions…'}
      </button>
    </section>
  );
}
