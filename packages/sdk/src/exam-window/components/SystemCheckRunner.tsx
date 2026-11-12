'use client';

import { useEffect, useState } from 'react';

export interface SystemCheckResult {
  webcam: boolean;
  microphone: boolean;
  screen_resolution_ok: boolean;
  browser_compatible: boolean;
  network_ok: boolean;
  rtt_ms: number | null;
  user_agent: string;
  screen: { width: number; height: number };
  external_monitor_warning: boolean;
}

export interface SystemCheckRunnerProps {
  camMicStream: MediaStream | null;
  /** URL to probe latency against; pass your API base */
  probeUrl?: string;
  brandPrimary?: string;
  /** Called when a live camera/mic stream is confirmed (including auto-acquire fallback). */
  onStreamAcquired?: (stream: MediaStream) => void;
  onComplete: (r: SystemCheckResult) => void;
}

export function SystemCheckRunner(props: SystemCheckRunnerProps) {
  const { camMicStream, probeUrl, brandPrimary = '#0f172a', onStreamAcquired, onComplete } = props;
  const [steps, setSteps] = useState<{ key: keyof SystemCheckResult | string; label: string; status: 'pending' | 'ok' | 'warn' | 'fail'; note?: string }[]>([]);
  const [result, setResult] = useState<SystemCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const next: typeof steps = [
      { key: 'webcam', label: 'Webcam', status: 'pending' },
      { key: 'microphone', label: 'Microphone', status: 'pending' },
      { key: 'screen', label: 'Screen resolution', status: 'pending' },
      { key: 'browser', label: 'Browser compatibility', status: 'pending' },
      { key: 'network', label: 'Network connectivity', status: 'pending' },
      { key: 'environment', label: 'Environment scan', status: 'pending' },
    ];
    setSteps(next);
    void run(next);
    return () => {
      cancelled = true;
    };
    async function run(s: typeof next) {
      let stream = camMicStream;
      if (!stream?.getVideoTracks().some((t) => t.readyState === 'live')) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
        } catch {
          stream = camMicStream;
        }
      }
      if (cancelled) return;
      const hasVideo = (stream?.getVideoTracks().length ?? 0) > 0;
      const hasAudio = (stream?.getAudioTracks().length ?? 0) > 0;
      if (stream && hasVideo && stream !== camMicStream) {
        onStreamAcquired?.(stream);
      }
      s[0].status = hasVideo ? 'ok' : 'fail';
      s[1].status = hasAudio ? 'ok' : 'fail';

      const screenOk = window.screen.width >= 1024 && window.screen.height >= 600;
      s[2].status = screenOk ? 'ok' : 'warn';
      s[2].note = `${window.screen.width}×${window.screen.height}`;

      const ua = navigator.userAgent;
      const browserOk = /Chrome|Edg|Firefox|Safari/.test(ua) && !/MSIE|Trident/.test(ua);
      s[3].status = browserOk ? 'ok' : 'fail';
      s[3].note = ua.slice(0, 80);

      let rtt: number | null = null;
      try {
        const t = performance.now();
        await fetch(probeUrl || '/', { method: 'HEAD', cache: 'no-store' });
        rtt = Math.round(performance.now() - t);
        s[4].status = rtt < 800 ? 'ok' : rtt < 1500 ? 'warn' : 'fail';
        s[4].note = `${rtt}ms`;
      } catch {
        s[4].status = 'fail';
        s[4].note = 'unreachable';
      }

      let multiScreen = false;
      try {
        const s2 = (window.screen as unknown as { isExtended?: boolean; availWidth?: number }).isExtended;
        multiScreen = Boolean(s2);
      } catch {
        /* ignore */
      }
      s[5].status = multiScreen ? 'warn' : 'ok';
      s[5].note = multiScreen ? 'Multiple displays detected' : 'Single display';

      const r: SystemCheckResult = {
        webcam: hasVideo,
        microphone: hasAudio,
        screen_resolution_ok: screenOk,
        browser_compatible: browserOk,
        network_ok: s[4].status !== 'fail',
        rtt_ms: rtt,
        user_agent: ua,
        screen: { width: window.screen.width, height: window.screen.height },
        external_monitor_warning: multiScreen,
      };
      setSteps([...s]);
      setResult(r);
    }
  }, [camMicStream, probeUrl, onStreamAcquired]);

  const ready = result && result.webcam && result.microphone && result.browser_compatible;

  const COLOR: Record<string, string> = { ok: '#16a34a', warn: '#d97706', fail: '#b91c1c', pending: '#64748b' };

  return (
    <section style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>Pre-exam system check</h2>
      <p style={{ color: '#475569', fontSize: 14, marginBottom: 12 }}>
        Verifying hardware, network, and environment readiness.{' '}
        <a href="/system-check.html" target="_blank" rel="noreferrer" style={{ color: brandPrimary }}>
          Open extended system check
        </a>
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {steps.map((s) => (
          <li
            key={s.key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid #e2e8f0',
              fontSize: 14,
            }}
          >
            <span>{s.label}</span>
            <span style={{ color: COLOR[s.status], fontWeight: 600 }}>
              {s.status.toUpperCase()}
              {s.note ? <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>{s.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!ready}
        onClick={() => result && onComplete(result)}
        style={{
          marginTop: 16,
          background: ready ? brandPrimary : '#cbd5e1',
          color: '#fff',
          border: 'none',
          padding: '10px 18px',
          borderRadius: 8,
          cursor: ready ? 'pointer' : 'not-allowed',
        }}
      >
        Continue to identity verification
      </button>
    </section>
  );
}
