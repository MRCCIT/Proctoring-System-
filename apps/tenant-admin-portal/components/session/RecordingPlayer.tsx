'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Badge, EmptyState } from '@proctorshield/ui-components';
import type { EvidenceRecording } from '@/lib/tenantApi';
import { formatBytes, formatOffset } from '@/lib/format';

export interface RecordingPlayerHandle {
  /** Seek to an absolute wall-clock instant (ISO) on both tracks. */
  seekToInstant: (iso: string) => void;
  /** Seek by seconds from recording start (preferred when offset_seconds is known). */
  seekToOffset: (seconds: number) => void;
  currentInstant: () => string | null;
}

type PaneTrack = 'camera' | 'screen' | 'audio';

const TRACK_LABEL: Record<string, string> = {
  camera: 'Camera + voice',
  screen: 'Screen',
  audio: 'Voice',
};

function pickTrack(playable: EvidenceRecording[], name: string) {
  return playable.find((r) => r.track === name) || null;
}

function hasAudio(rec: EvidenceRecording | null) {
  if (!rec?.mime_type) return false;
  const m = rec.mime_type.toLowerCase();
  return m.includes('opus') || m.includes('audio') || m.includes('mp4a') || m.includes('aac');
}

function stripMediaFragment(url: string) {
  return url.split('#')[0];
}

function withTimeFragment(url: string, seconds: number) {
  const base = stripMediaFragment(url);
  const t = Math.max(0, seconds);
  return `${base}#t=${t.toFixed(2)}`;
}

function seekableEnd(el: HTMLMediaElement): number | null {
  try {
    if (el.seekable && el.seekable.length > 0) {
      const end = el.seekable.end(el.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Dual review player: camera (with mic voice) + screen side-by-side, synced seeking.
 * MediaRecorder WebM is often poorly seekable — fragment reloads are driven via React
 * state so a later re-render cannot wipe `el.src` back to the unfragmented URL.
 */
export const RecordingPlayer = forwardRef<
  RecordingPlayerHandle,
  { recordings: EvidenceRecording[]; onUrlExpired?: () => void; onTime?: (instantIso: string | null) => void }
>(function RecordingPlayer({ recordings, onUrlExpired, onTime }, ref) {
  const playable = useMemo(() => recordings.filter((r) => r.url), [recordings]);
  const camera = pickTrack(playable, 'camera');
  const screen = pickTrack(playable, 'screen');
  const audioOnly = pickTrack(playable, 'audio');
  const voiceSource = camera || audioOnly;
  const voiceOn = hasAudio(voiceSource);

  const primary = camera || screen || audioOnly || playable[0] || null;
  const cameraRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pending = useRef<number | null>(null);
  const ready = useRef(false);
  const syncing = useRef(false);
  const startMsRef = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  /** React-owned seek target — keeps #t= on src across re-renders. */
  const [seekAt, setSeekAt] = useState<number | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);

  const startMs = primary?.started_at ? new Date(primary.started_at).getTime() : null;
  startMsRef.current = startMs;
  const isWebm = Boolean(primary?.mime_type?.toLowerCase().includes('webm'));
  const isMp4 = Boolean(primary?.mime_type?.toLowerCase().includes('mp4'));

  const cameraSrc = useMemo(() => {
    if (!camera?.url) return null;
    if (seekAt == null) return camera.url;
    return withTimeFragment(camera.url, seekAt);
  }, [camera?.url, seekAt, seekNonce]);

  const screenSrc = useMemo(() => {
    if (!screen?.url) return null;
    if (seekAt == null) return screen.url;
    return withTimeFragment(screen.url, seekAt);
  }, [screen?.url, seekAt, seekNonce]);

  const applyCurrentTime = (el: HTMLMediaElement | null, sec: number) => {
    if (!el) return;
    let t = Math.max(0, sec);
    const end = seekableEnd(el);
    // Only clamp when the browser reports a usable seekable range that covers
    // at least the target — never clamp a 7s jump down to ~0 on broken WebM.
    if (end != null && end + 0.25 >= t) {
      t = Math.min(t, Math.max(0, end - 0.05));
    } else if (Number.isFinite(el.duration) && el.duration > 0 && el.duration !== Infinity && el.duration + 0.25 >= t) {
      t = Math.min(t, el.duration - 0.05);
    }
    try {
      el.currentTime = t;
    } catch {
      /* ignore */
    }
  };

  const verifySeek = (target: number) => {
    window.setTimeout(() => {
      const el = cameraRef.current || screenRef.current;
      if (!el) return;
      const actual = el.currentTime;
      if (!Number.isFinite(actual)) return;
      if (target > 1.5 && actual < Math.max(0.5, target * 0.15)) {
        setSeekHint(
          'This recording format (raw WebM) often cannot jump precisely in the browser. Use the nearest snapshot below, or remux to MP4.'
        );
        // Hard fragment reload via React state (survives re-renders).
        setSeekAt(target);
        setSeekNonce((n) => n + 1);
      } else {
        setSeekHint(null);
        setTime(actual);
      }
    }, 500);
  };

  const applySeek = (sec: number, preferFragment: boolean) => {
    const t = Math.max(0, sec);
    syncing.current = true;
    setTime(t);

    if (preferFragment) {
      // Drive #t= through React so setActiveEvent / time updates cannot reset src.
      setSeekAt(t);
      setSeekNonce((n) => n + 1);
      window.setTimeout(() => {
        applyCurrentTime(cameraRef.current, t);
        applyCurrentTime(screenRef.current, t);
        applyCurrentTime(audioRef.current, t);
        void cameraRef.current?.play().catch(() => {});
        void screenRef.current?.play().catch(() => {});
        void audioRef.current?.play().catch(() => {});
        syncing.current = false;
        verifySeek(t);
      }, 80);
      return;
    }

    applyCurrentTime(cameraRef.current, t);
    applyCurrentTime(screenRef.current, t);
    applyCurrentTime(audioRef.current, t);
    void cameraRef.current?.play().catch(() => {});
    void screenRef.current?.play().catch(() => {});
    void audioRef.current?.play().catch(() => {});
    window.setTimeout(() => {
      syncing.current = false;
    }, 350);
    verifySeek(t);
  };

  const queueSeek = (sec: number) => {
    const t = Math.max(0, sec);
    const el = cameraRef.current || screenRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // MP4 / well-indexed media: currentTime. WebM / unknown: fragment reload.
    const end = el ? seekableEnd(el) : null;
    const canDirect =
      isMp4 || (end != null && end >= Math.max(2, t)) || (!isWebm && Number.isFinite(el?.duration) && (el?.duration || 0) > t);

    if (ready.current) applySeek(t, !canDirect || (isWebm && t > 0.4));
    else pending.current = t;
  };

  const onPrimaryMeta = (v: HTMLVideoElement | HTMLAudioElement) => {
    const finish = () => {
      ready.current = true;
      if (pending.current != null) {
        const p = pending.current;
        pending.current = null;
        applySeek(p, isWebm && p > 0.4);
      } else if (seekAt != null) {
        applyCurrentTime(v, seekAt);
      }
    };
    if (!Number.isFinite(v.duration) || v.duration === Infinity) {
      const onUpdate = () => {
        v.removeEventListener('timeupdate', onUpdate);
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
        finish();
      };
      v.addEventListener('timeupdate', onUpdate);
      try {
        v.currentTime = 1e101;
      } catch {
        finish();
      }
      window.setTimeout(() => {
        v.removeEventListener('timeupdate', onUpdate);
        if (!ready.current) finish();
      }, 1500);
    } else finish();
  };

  useImperativeHandle(ref, () => ({
    seekToOffset: (seconds: number) => {
      queueSeek(Math.max(0, Number(seconds) - 0.35));
    },
    seekToInstant: (iso: string) => {
      const start = startMsRef.current;
      if (start == null) {
        queueSeek(0);
        return;
      }
      const sec = Math.max(0, (new Date(iso).getTime() - start) / 1000 - 0.35);
      queueSeek(sec);
    },
    currentInstant: () => {
      const start = startMsRef.current;
      if (start == null) return null;
      const cur = cameraRef.current?.currentTime || screenRef.current?.currentTime || 0;
      return new Date(start + cur * 1000).toISOString();
    },
  }));

  useEffect(() => {
    ready.current = false;
    setSeekHint(null);
    setSeekAt(null);
    setSeekNonce(0);
    pending.current = null;
  }, [camera?.url, screen?.url, audioOnly?.url]);

  useEffect(() => {
    for (const el of [cameraRef.current, audioRef.current]) {
      if (el) el.muted = muted;
    }
  }, [muted]);

  if (!primary) {
    return (
      <EmptyState
        icon="video"
        title="No recording available"
        description="The recording appears once the candidate's browser uploads media. Snapshots are still available under Evidence."
      />
    );
  }

  const panes: { key: PaneTrack; rec: EvidenceRecording | null; label: string; src: string | null }[] = [
    { key: 'camera', rec: camera, label: 'Camera', src: cameraSrc },
    { key: 'screen', rec: screen, label: 'Screen', src: screenSrc },
  ];

  return (
    <div>
      <div className="rec-dual">
        {panes.map(({ key, rec, label, src }) => (
          <div key={key} className="rec-pane">
            <div className="rec-pane-head">
              <strong>{label}</strong>
              {key === 'camera' && voiceOn && (
                <Badge tone="success" dot>
                  Voice
                </Badge>
              )}
              {!rec && <Badge tone="neutral">Not recorded</Badge>}
            </div>
            <div className="rec-stage">
              {src ? (
                <video
                  key={`${key}-${stripMediaFragment(src)}-${seekNonce}`}
                  ref={key === 'camera' ? cameraRef : screenRef}
                  src={src}
                  controls={key === 'camera' || !camera}
                  muted={key === 'screen' ? true : muted}
                  preload="auto"
                  playsInline
                  className="rec-video"
                  onLoadedMetadata={(e) => {
                    if (key === 'camera' || (!camera && key === 'screen')) onPrimaryMeta(e.currentTarget);
                    if (seekAt != null) {
                      applyCurrentTime(e.currentTarget, seekAt);
                      void e.currentTarget.play().catch(() => {});
                    }
                  }}
                  onPlay={() => {
                    if (syncing.current) return;
                    if (key === 'camera') {
                      void screenRef.current?.play().catch(() => {});
                      void audioRef.current?.play().catch(() => {});
                    }
                  }}
                  onPause={() => {
                    if (syncing.current) return;
                    if (key === 'camera') {
                      screenRef.current?.pause();
                      audioRef.current?.pause();
                    }
                  }}
                  onTimeUpdate={(e) => {
                    if (key !== 'camera' && camera) return;
                    const t = e.currentTarget.currentTime;
                    if (!Number.isFinite(t) || t > 1e9) return;
                    setTime(t);
                    onTime?.(startMs != null ? new Date(startMs + t * 1000).toISOString() : null);
                    if (!syncing.current && screenRef.current && Math.abs(screenRef.current.currentTime - t) > 0.35) {
                      try {
                        screenRef.current.currentTime = t;
                      } catch {
                        /* ignore */
                      }
                    }
                    if (!syncing.current && audioRef.current && Math.abs(audioRef.current.currentTime - t) > 0.35) {
                      try {
                        audioRef.current.currentTime = t;
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  onSeeked={(e) => {
                    if (key !== 'camera' && camera) return;
                    const t = e.currentTarget.currentTime;
                    setTime(t);
                    syncing.current = true;
                    if (screenRef.current) {
                      try {
                        screenRef.current.currentTime = t;
                      } catch {
                        /* ignore */
                      }
                    }
                    if (audioRef.current) {
                      try {
                        audioRef.current.currentTime = t;
                      } catch {
                        /* ignore */
                      }
                    }
                    requestAnimationFrame(() => {
                      syncing.current = false;
                    });
                  }}
                  onError={() => onUrlExpired?.()}
                />
              ) : (
                <div className="rec-missing">
                  <span>{label} recording was not uploaded for this session.</span>
                  <span className="ps-muted" style={{ fontSize: 12 }}>
                    {key === 'screen'
                      ? 'Candidate must share their screen during the exam for this pane to fill.'
                      : 'Camera media will appear here after upload.'}
                  </span>
                </div>
              )}
            </div>
            {rec && (
              <div className="rec-pane-meta">
                {formatBytes(rec.bytes)} · {rec.mime_type?.includes('mp4') ? 'MP4' : 'WebM'}
                {rec.url && (
                  <>
                    {' · '}
                    <a href={stripMediaFragment(rec.url)} target="_blank" rel="noreferrer">
                      Download
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {audioOnly?.url && !hasAudio(camera) && (
        <audio
          key={audioOnly.url}
          ref={audioRef}
          src={audioOnly.url}
          controls
          preload="auto"
          style={{ width: '100%', marginTop: 10 }}
          muted={muted}
          onLoadedMetadata={(e) => {
            if (!camera && !screen) onPrimaryMeta(e.currentTarget);
          }}
          onError={() => onUrlExpired?.()}
        />
      )}

      {seekHint ? (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 12.5,
            color: '#9a3412',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          {seekHint}
        </p>
      ) : null}

      <div className="ps-between" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="ps-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {playable.map((r) => (
            <Badge key={r.id} tone={r.track === 'camera' ? 'brand' : r.track === 'screen' ? 'info' : 'success'}>
              {TRACK_LABEL[r.track] || r.track}
            </Badge>
          ))}
          {voiceOn ? (
            <Badge tone="success" dot>
              Mic audio on camera
            </Badge>
          ) : (
            <Badge tone="warning">No mic audio in recording</Badge>
          )}
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-sm" onClick={() => setMuted((m) => !m)}>
            {muted ? 'Unmute voice' : 'Mute voice'}
          </button>
        </div>
        <span className="ps-muted" style={{ fontSize: 12.5 }}>
          {formatOffset(time)} · click a detection to jump here
        </span>
      </div>
    </div>
  );
});
