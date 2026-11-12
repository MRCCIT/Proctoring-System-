'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EmptyState } from '@proctorshield/ui-components';
import type { EvidenceRecording } from '@/lib/tenantApi';
import { formatBytes, formatOffset } from '@/lib/format';

export interface RecordingPlayerHandle {
  /** Seek to an absolute wall-clock instant (ISO) on the selected track. */
  seekToInstant: (iso: string) => void;
  currentInstant: () => string | null;
}

/**
 * Plays the merged session recording. MediaRecorder WebM files often lack a duration/cue index;
 * the "seek far then back" trick forces the browser to compute duration so seeking works.
 */
export const RecordingPlayer = forwardRef<
  RecordingPlayerHandle,
  { recordings: EvidenceRecording[]; onUrlExpired?: () => void; onTime?: (instantIso: string | null) => void }
>(function RecordingPlayer({ recordings, onUrlExpired, onTime }, ref) {
  const playable = recordings.filter((r) => r.url);
  const tracks = Array.from(new Set(playable.map((r) => r.track)));
  const [track, setTrack] = useState<string>(tracks.includes('camera') ? 'camera' : tracks[0] || 'camera');
  const current = playable.find((r) => r.track === track) || playable[0] || null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const pending = useRef<number | null>(null);
  const ready = useRef(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!tracks.includes(track) && tracks[0]) setTrack(tracks[0]);
  }, [tracks.join(','), track]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ready.current = false;
  }, [current?.url]);

  const startMs = current?.started_at ? new Date(current.started_at).getTime() : null;

  const applySeek = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, sec);
    void v.play().catch(() => {});
  };

  useImperativeHandle(ref, () => ({
    seekToInstant: (iso: string) => {
      if (startMs == null) return;
      const sec = Math.max(0, (new Date(iso).getTime() - startMs) / 1000 - 2);
      if (ready.current) applySeek(sec);
      else pending.current = sec;
      videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    currentInstant: () => (startMs == null ? null : new Date(startMs + (videoRef.current?.currentTime || 0) * 1000).toISOString()),
  }));

  if (!current) {
    return (
      <EmptyState
        icon="video"
        title="No recording available"
        description="The recording appears once the candidate's browser uploads media. Snapshots are still available under Evidence."
      />
    );
  }

  return (
    <div>
      <div className="rec-stage">
        <video
          key={current.url || current.id}
          ref={videoRef}
          src={current.url || undefined}
          controls
          preload="metadata"
          playsInline
          className="rec-video"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            const finish = () => {
              ready.current = true;
              if (pending.current != null) {
                applySeek(pending.current);
                pending.current = null;
              }
            };
            if (!Number.isFinite(v.duration)) {
              const onUpdate = () => {
                v.removeEventListener('timeupdate', onUpdate);
                v.currentTime = 0;
                finish();
              };
              v.addEventListener('timeupdate', onUpdate);
              v.currentTime = 1e101;
            } else finish();
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            if (!Number.isFinite(t) || t > 1e9) return;
            setTime(t);
            onTime?.(startMs != null ? new Date(startMs + t * 1000).toISOString() : null);
          }}
          onError={() => onUrlExpired?.()}
        />
      </div>
      <div className="ps-between" style={{ marginTop: 10 }}>
        <div className="ps-segment">
          {tracks.map((t) => (
            <button key={t} type="button" className={t === track ? 'active' : ''} onClick={() => setTrack(t)}>
              {t === 'camera' ? 'Camera' : t === 'screen' ? 'Screen' : t}
            </button>
          ))}
        </div>
        <span className="ps-muted" style={{ fontSize: 12.5 }}>
          {formatOffset(time)} · {current.mime_type?.includes('mp4') ? 'MP4' : 'WebM'} · {formatBytes(current.bytes)}
          {current.url && (
            <>
              {' · '}
              <a href={current.url} target="_blank" rel="noreferrer">
                Download
              </a>
            </>
          )}
        </span>
      </div>
    </div>
  );
});
