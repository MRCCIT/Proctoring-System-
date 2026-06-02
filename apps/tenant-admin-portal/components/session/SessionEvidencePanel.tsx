'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { formatBytes } from '@/lib/format';
import {
  fetchRecordingBlobUrl,
  fetchSnapshotBlobUrl,
  parseViolationLabel,
  revokeBlobUrls,
  snapshotKind,
} from '@/lib/sessionMedia';

export interface SnapshotRow {
  id: string;
  object_key?: string;
  caption: string | null;
  captured_at: string;
  file_path?: string | null;
  bytes?: number | null;
  source?: string | null;
}

export interface RecordingRow {
  id: string | number;
  track: string;
  sequence: number;
  duration_ms: number | null;
  bytes: number | null;
  started_at: string;
  object_key?: string;
  file_path?: string | null;
  mime_type?: string | null;
  metadata?: { merged?: boolean; display_name?: string; candidate_label?: string; segment_count?: number } | string;
}

function parseRecMeta(metadata: RecordingRow['metadata']) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata) as { merged?: boolean; display_name?: string; candidate_label?: string };
  } catch {
    return {};
  }
}

type SnapFilter = 'all' | 'violations' | 'live';

interface LoadedSnap {
  id: string;
  url: string;
  caption: string | null;
  captured_at: string;
  kind: 'violation' | 'live' | 'other';
  violationType: string | null;
}

interface LoadedRec {
  id: string;
  track: string;
  sequence: number;
  url: string;
  duration_ms: number | null;
  bytes: number | null;
  started_at: string;
  displayName: string;
  isMerged: boolean;
}

export function SessionEvidencePanel(props: {
  sessionId: string;
  candidateName?: string;
  snapshots: SnapshotRow[];
  recordings: RecordingRow[];
  onExportReport?: () => void;
  reportUrl?: string | null;
}) {
  const { snapshots, recordings, onExportReport, reportUrl, candidateName } = props;
  const [tab, setTab] = useState<'snapshots' | 'recordings'>('snapshots');
  const [snapFilter, setSnapFilter] = useState<SnapFilter>('all');
  const [loadedSnaps, setLoadedSnaps] = useState<LoadedSnap[]>([]);
  const [loadedRecs, setLoadedRecs] = useState<LoadedRec[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [selectedSnap, setSelectedSnap] = useState<LoadedSnap | null>(null);
  const [activeRecId, setActiveRecId] = useState<string | null>(null);
  const [recTrack, setRecTrack] = useState<'camera' | 'screen' | 'all'>('camera');
  const snapUrlsRef = useRef<string[]>([]);
  const recUrlsRef = useRef<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const filteredSnapRows = useMemo(() => {
    return snapshots.filter((s) => {
      const kind = snapshotKind(s.source, s.caption);
      if (snapFilter === 'violations') return kind === 'violation';
      if (snapFilter === 'live') return kind === 'live';
      return true;
    });
  }, [snapshots, snapFilter]);

  const loadSnapshots = useCallback(async () => {
    setLoadingSnaps(true);
    revokeBlobUrls(snapUrlsRef.current);
    snapUrlsRef.current = [];
    const withFiles = filteredSnapRows.filter((s) => s.file_path || (s.bytes != null && s.bytes > 0));
    const results = await Promise.all(
      withFiles.map(async (s) => {
        const url = await fetchSnapshotBlobUrl(s.id);
        if (!url) return null;
        snapUrlsRef.current.push(url);
        const kind = snapshotKind(s.source, s.caption);
        return {
          id: s.id,
          url,
          caption: s.caption,
          captured_at: s.captured_at,
          kind,
          violationType: parseViolationLabel(s.caption),
        } satisfies LoadedSnap;
      })
    );
    setLoadedSnaps(results.filter(Boolean) as LoadedSnap[]);
    setLoadingSnaps(false);
  }, [filteredSnapRows]);

  const loadRecordings = useCallback(async () => {
    setLoadingRecs(true);
    revokeBlobUrls(recUrlsRef.current);
    recUrlsRef.current = [];
    const withFiles = recordings.filter((r) => r.file_path || (r.bytes != null && r.bytes > 0));
    const results = await Promise.all(
      withFiles.map(async (r) => {
        const url = await fetchRecordingBlobUrl(r.id);
        if (!url) return null;
        recUrlsRef.current.push(url);
        const meta = parseRecMeta(r.metadata);
        const label =
          meta.display_name ||
          (candidateName
            ? `${candidateName.replace(/[^a-zA-Z0-9._-]+/g, '_')}-${r.track}.webm`
            : `${r.track}-${r.sequence}.webm`);
        return {
          id: String(r.id),
          track: r.track,
          sequence: r.sequence,
          url,
          duration_ms: r.duration_ms,
          bytes: r.bytes,
          started_at: r.started_at,
          displayName: label,
          isMerged: Boolean(meta.merged),
        } satisfies LoadedRec;
      })
    );
    setLoadedRecs(results.filter(Boolean) as LoadedRec[]);
    if (results[0]) setActiveRecId(String(results[0]?.id));
    setLoadingRecs(false);
  }, [recordings, candidateName]);

  useEffect(() => {
    void loadSnapshots();
    return () => revokeBlobUrls(snapUrlsRef.current);
  }, [loadSnapshots]);

  useEffect(() => {
    void loadRecordings();
    return () => revokeBlobUrls(recUrlsRef.current);
  }, [loadRecordings]);

  const trackRecs = useMemo(() => {
    const list = loadedRecs.filter((r) => recTrack === 'all' || r.track === recTrack);
    return list.sort((a, b) => a.sequence - b.sequence);
  }, [loadedRecs, recTrack]);

  const activeRec = trackRecs.find((r) => r.id === activeRecId) || trackRecs[0];

  useEffect(() => {
    if (activeRec && videoRef.current) {
      videoRef.current.src = activeRec.url;
      void videoRef.current.play().catch(() => {});
    }
  }, [activeRec?.id, activeRec?.url]);

  const violationCount = loadedSnaps.filter((s) => s.kind === 'violation').length;

  return (
    <div className="evidence">
      <div className="evidence-header">
        <div>
          <h2 className="evidence-title">Evidence</h2>
          <p className="evidence-sub">
            {loadedSnaps.length} snapshots · {loadedRecs.length} recording
            {loadedRecs.length === 1 ? '' : 's'}
            {loadedRecs.some((r) => r.isMerged) ? ' (full session)' : ''}
            {violationCount > 0 && (
              <span className="evidence-badge-warn"> · {violationCount} violation captures</span>
            )}
          </p>
        </div>
        <div className="evidence-header-actions">
          {onExportReport && (
            <button type="button" className="evidence-btn" onClick={onExportReport}>
              Export report
            </button>
          )}
          {reportUrl && (
            <a href={reportUrl} target="_blank" rel="noreferrer" className="evidence-btn evidence-btn-primary">
              Open report
            </a>
          )}
        </div>
      </div>

      <div className="evidence-tabs">
        <button
          type="button"
          className={`evidence-tab ${tab === 'snapshots' ? 'evidence-tab-active' : ''}`}
          onClick={() => setTab('snapshots')}
        >
          Snapshots ({snapshots.length})
        </button>
        <button
          type="button"
          className={`evidence-tab ${tab === 'recordings' ? 'evidence-tab-active' : ''}`}
          onClick={() => setTab('recordings')}
        >
          Recordings ({recordings.length})
        </button>
      </div>

      {tab === 'snapshots' && (
        <Card>
          <div className="evidence-filters">
            {(['all', 'violations', 'live'] as SnapFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`evidence-chip ${snapFilter === f ? 'evidence-chip-active' : ''}`}
                onClick={() => setSnapFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'violations' ? 'Violations' : 'Live monitor'}
              </button>
            ))}
          </div>

          {loadingSnaps ? (
            <p className="muted">Loading images…</p>
          ) : loadedSnaps.length === 0 ? (
            <p className="muted">No viewable snapshots for this filter. Files may still be uploading.</p>
          ) : (
            <div className="evidence-snap-grid">
              {loadedSnaps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="evidence-snap-card"
                  onClick={() => setSelectedSnap(s)}
                >
                  <img src={s.url} alt={s.caption || 'Snapshot'} className="evidence-snap-img" />
                  <div className="evidence-snap-meta">
                    <span className="evidence-snap-time">
                      {new Date(s.captured_at).toLocaleTimeString()}
                    </span>
                    {s.kind === 'violation' && s.violationType && (
                      <span className="evidence-snap-badge">{s.violationType}</span>
                    )}
                    {s.kind === 'live' && <span className="evidence-snap-badge evidence-snap-badge-live">Live</span>}
                  </div>
                  {s.caption && <span className="evidence-snap-caption">{s.caption}</span>}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'recordings' && (
        <Card>
          <div className="evidence-rec-layout">
            <div className="evidence-rec-player-wrap">
              {loadingRecs ? (
                <div className="evidence-rec-placeholder">Loading video…</div>
              ) : !activeRec ? (
                <div className="evidence-rec-placeholder">No recording files on disk for this session.</div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="evidence-rec-video"
                    controls
                    playsInline
                    preload="metadata"
                  />
                  <p className="evidence-rec-now">
                    <strong>{activeRec.displayName}</strong>
                    {activeRec.isMerged ? ' · full recording' : ` · segment #${activeRec.sequence}`}
                    {activeRec.duration_ms != null && ` · ${Math.round(activeRec.duration_ms / 1000)}s`}
                    {activeRec.bytes != null && ` · ${formatBytes(activeRec.bytes)}`}
                  </p>
                  <a
                    href={activeRec.url}
                    download={activeRec.displayName}
                    className="evidence-btn"
                    style={{ marginTop: 8, display: 'inline-block' }}
                  >
                    Download video
                  </a>
                </>
              )}
            </div>

            <div className="evidence-rec-list">
              <div className="evidence-filters">
                {(['camera', 'screen', 'all'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`evidence-chip ${recTrack === t ? 'evidence-chip-active' : ''}`}
                    onClick={() => setRecTrack(t)}
                  >
                    {t === 'all' ? 'All tracks' : t}
                  </button>
                ))}
              </div>
              <ul className="evidence-rec-segments">
                {trackRecs.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`evidence-rec-seg ${activeRec?.id === r.id ? 'evidence-rec-seg-active' : ''}`}
                      onClick={() => setActiveRecId(r.id)}
                    >
                      <span className="evidence-rec-seg-track">{r.displayName}</span>
                      {!r.isMerged && <span>#{r.sequence}</span>}
                      <span className="evidence-rec-seg-meta">
                        {r.duration_ms != null ? `${Math.round(r.duration_ms / 1000)}s` : '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {selectedSnap && (
        <div className="evidence-lightbox" role="dialog" aria-modal onClick={() => setSelectedSnap(null)}>
          <div className="evidence-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="evidence-lightbox-close" onClick={() => setSelectedSnap(null)} aria-label="Close">
              ×
            </button>
            <img src={selectedSnap.url} alt="" className="evidence-lightbox-img" />
            <div className="evidence-lightbox-footer">
              <strong>{new Date(selectedSnap.captured_at).toLocaleString()}</strong>
              {selectedSnap.caption && <span> — {selectedSnap.caption}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

