'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Badge, EmptyState } from '@proctorshield/ui-components';
import type { EvidenceRecording, EvidenceRecordingSource } from '@/lib/tenantApi';
import { formatBytes, formatOffset } from '@/lib/format';

export interface RecordingPlayerHandle {
  /** Seek to an absolute wall-clock instant (ISO) on both tracks. */
  seekToInstant: (iso: string) => void;
  /** Seek by seconds from recording start (preferred when offset_seconds is known). */
  seekToOffset: (seconds: number) => void;
  currentInstant: () => string | null;
}

type PaneTrack = 'camera' | 'screen' | 'audio';
type SourceKey = 'compressed' | 'fallback' | 'original';

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

function resolveSource(
  rec: EvidenceRecording | null,
  override: SourceKey | null
): { key: SourceKey | 'legacy'; url: string; mime: string | null; label: string } | null {
  if (!rec) return null;
  const order: SourceKey[] = override
    ? [override, 'compressed', 'fallback', 'original']
    : ['compressed', 'fallback', 'original'];
  const seen = new Set<string>();
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const src: EvidenceRecordingSource | null | undefined = rec.sources?.[key];
    if (key === 'compressed' && src && src.compression_status && src.compression_status !== 'completed') {
      if (!src.url || src.compression_status === 'compression_failed' || src.compression_status === 'validation_failed') {
        continue;
      }
      if (src.compression_status !== 'completed' && !override) continue;
    }
    if (src?.url) {
      return {
        key,
        url: src.url,
        mime: src.mime_type,
        label: key === 'compressed' ? 'Compressed' : key === 'fallback' ? 'H.264 fallback' : 'Original',
      };
    }
  }
  if (rec.url) {
    return { key: (rec.preferred_source as SourceKey) || 'legacy', url: rec.url, mime: rec.mime_type, label: 'Recording' };
  }
  return null;
}

/**
 * Dual review player: camera (with mic voice) + screen side-by-side, synced seeking.
 * Prefers compressed (AV1/VP9) → H.264 fallback → original; switches on decode error.
 */
export const RecordingPlayer = forwardRef<
  RecordingPlayerHandle,
  { recordings: EvidenceRecording[]; onUrlExpired?: () => void; onTime?: (instantIso: string | null) => void }
>(function RecordingPlayer({ recordings, onUrlExpired, onTime }, ref) {
  const playable = useMemo(() => recordings.filter((r) => r.url || r.sources?.original?.url || r.sources?.compressed?.url || r.sources?.fallback?.url), [recordings]);
  const cameraRec = pickTrack(playable, 'camera');
  const screenRec = pickTrack(playable, 'screen');
  const audioOnly = pickTrack(playable, 'audio');

  const [sourceOverride, setSourceOverride] = useState<SourceKey | null>(null);
  const [failedKeys, setFailedKeys] = useState<Set<string>>(() => new Set());

  const cameraResolved = useMemo(() => {
    const r = resolveSource(cameraRec, sourceOverride);
    if (r && failedKeys.has(`camera:${r.key}`)) {
      for (const next of ['fallback', 'original', 'compressed'] as SourceKey[]) {
        if (failedKeys.has(`camera:${next}`)) continue;
        const alt = resolveSource(cameraRec, next);
        if (alt && alt.key !== r.key) return alt;
      }
    }
    return r;
  }, [cameraRec, sourceOverride, failedKeys]);

  const screenResolved = useMemo(() => {
    const r = resolveSource(screenRec, sourceOverride);
    if (r && failedKeys.has(`screen:${r.key}`)) {
      for (const next of ['fallback', 'original', 'compressed'] as SourceKey[]) {
        if (failedKeys.has(`screen:${next}`)) continue;
        const alt = resolveSource(screenRec, next);
        if (alt && alt.key !== r.key) return alt;
      }
    }
    return r;
  }, [screenRec, sourceOverride, failedKeys]);

  const voiceSource = cameraRec || audioOnly;
  const voiceOn = hasAudio(voiceSource);
  const primary = cameraRec || screenRec || audioOnly || playable[0] || null;
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
  const [seekAt, setSeekAt] = useState<number | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);

  const startMs = primary?.started_at ? new Date(primary.started_at).getTime() : null;
  startMsRef.current = startMs;
  const primaryMime = cameraResolved?.mime || screenResolved?.mime || primary?.mime_type;
  const isWebm = Boolean(primaryMime?.toLowerCase().includes('webm'));
  const isMp4 = Boolean(primaryMime?.toLowerCase().includes('mp4'));

  const cameraSrc = useMemo(() => {
    if (!cameraResolved?.url) return null;
    if (seekAt == null) return cameraResolved.url;
    return withTimeFragment(cameraResolved.url, seekAt);
  }, [cameraResolved?.url, seekAt, seekNonce]);

  const screenSrc = useMemo(() => {
    if (!screenResolved?.url) return null;
    if (seekAt == null) return screenResolved.url;
    return withTimeFragment(screenResolved.url, seekAt);
  }, [screenResolved?.url, seekAt, seekNonce]);

  const applyCurrentTime = (el: HTMLMediaElement | null, sec: number) => {
    if (!el) return;
    let t = Math.max(0, sec);
    const end = seekableEnd(el);
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
          'This recording format (raw WebM) often cannot jump precisely in the browser. Use the nearest snapshot below, or wait for compressed/H.264 output.'
        );
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

  const onDecodeError = (track: PaneTrack, key: string) => {
    setFailedKeys((prev) => {
      const next = new Set(prev);
      next.add(`${track}:${key}`);
      return next;
    });
    if (key === 'compressed') setSourceOverride((cur) => cur || 'fallback');
    else if (key === 'fallback') setSourceOverride('original');
    else onUrlExpired?.();
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
  }, [cameraResolved?.url, screenResolved?.url, audioOnly?.url]);

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

  const panes: { key: PaneTrack; rec: EvidenceRecording | null; label: string; src: string | null; resolvedKey: string }[] = [
    { key: 'camera', rec: cameraRec, label: 'Camera', src: cameraSrc, resolvedKey: cameraResolved?.key || 'legacy' },
    { key: 'screen', rec: screenRec, label: 'Screen', src: screenSrc, resolvedKey: screenResolved?.key || 'legacy' },
  ];

  const availableSources: SourceKey[] = [];
  for (const k of ['compressed', 'fallback', 'original'] as SourceKey[]) {
    if (cameraRec?.sources?.[k]?.url || screenRec?.sources?.[k]?.url) availableSources.push(k);
  }

  return (
    <div>
      <div className="rec-dual">
        {panes.map(({ key, rec, label, src, resolvedKey }) => (
          <div key={key} className="rec-pane">
            <div className="rec-pane-head">
              <strong>{label}</strong>
              {key === 'camera' && voiceOn && (
                <Badge tone="success" dot>
                  Voice
                </Badge>
              )}
              {!rec && <Badge tone="neutral">Not recorded</Badge>}
              {src && (
                <Badge tone={resolvedKey === 'compressed' ? 'brand' : resolvedKey === 'fallback' ? 'info' : 'neutral'}>
                  {resolvedKey === 'compressed' ? 'Compressed' : resolvedKey === 'fallback' ? 'H.264' : resolvedKey === 'original' ? 'Original' : 'File'}
                </Badge>
              )}
            </div>
            <div className="rec-stage">
              {src ? (
                <video
                  key={`${key}-${stripMediaFragment(src)}-${seekNonce}-${resolvedKey}`}
                  ref={key === 'camera' ? cameraRef : screenRef}
                  src={src}
                  controls={key === 'camera' || !cameraRec}
                  muted={key === 'screen' ? true : muted}
                  preload="auto"
                  playsInline
                  className="rec-video"
                  onLoadedMetadata={(e) => {
                    if (key === 'camera' || (!cameraRec && key === 'screen')) onPrimaryMeta(e.currentTarget);
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
                    if (key !== 'camera' && cameraRec) return;
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
                    if (key !== 'camera' && cameraRec) return;
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
                  onError={() => onDecodeError(key, resolvedKey)}
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
                {formatBytes(rec.bytes)} · {primaryMime?.includes('mp4') ? 'MP4' : 'WebM'}
                {src && (
                  <>
                    {' · '}
                    <a href={stripMediaFragment(src)} target="_blank" rel="noreferrer">
                      Download
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {audioOnly?.url && !hasAudio(cameraRec) && (
        <audio
          key={audioOnly.url}
          ref={audioRef}
          src={audioOnly.url}
          controls
          preload="auto"
          style={{ width: '100%', marginTop: 10 }}
          muted={muted}
          onLoadedMetadata={(e) => {
            if (!cameraRec && !screenRec) onPrimaryMeta(e.currentTarget);
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
          {availableSources.length > 1 && (
            <label className="ps-muted" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Source
              <select
                value={sourceOverride || cameraResolved?.key || screenResolved?.key || 'compressed'}
                onChange={(e) => setSourceOverride(e.target.value as SourceKey)}
                style={{ fontSize: 12.5 }}
              >
                {availableSources.map((k) => (
                  <option key={k} value={k}>
                    {k === 'compressed' ? 'Compressed' : k === 'fallback' ? 'H.264 fallback' : 'Original'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <span className="ps-muted" style={{ fontSize: 12.5 }}>
          {formatOffset(time)} · click a detection to jump here
        </span>
      </div>
    </div>
  );
});
