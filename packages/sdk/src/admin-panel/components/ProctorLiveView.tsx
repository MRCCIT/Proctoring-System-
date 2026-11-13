'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProctorShieldClient } from '../../core/ProctorShieldClient';
import { ProctorChatClient } from '../../events/ProctorChatClient';
import { LiveVideoSignaling } from '../../media/LiveVideoSignaling';
import {
  candidateInitials,
  formatMatchScore,
  parseViolationCaption,
  sessionStatusTone,
} from './proctorLiveHelpers';
import { pickPlayerTier } from '../playerTier';

export interface ProctorLiveViewProps {
  client: ProctorShieldClient;
  bearerToken: string;
  sessionId: string;
  baseUrl?: string;
  brandPrimary?: string;
}

interface FaceCheckRow {
  occurred_at: string;
  face_count: number;
  violations: string[];
  detector: string;
  match_score?: number | null;
  source?: string | null;
}

interface SnapRow {
  id: string;
  caption?: string | null;
  captured_at?: string;
  source?: string | null;
  file_path?: string | null;
  bytes?: number | null;
}

type LightboxItem = { url: string; title: string; subtitle?: string };

function IconLive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 9l5-3v12l-5-3V9z" />
    </svg>
  );
}

export function ProctorLiveView(props: ProctorLiveViewProps) {
  const { client, bearerToken, sessionId, brandPrimary = '#0f172a' } = props;
  const baseUrl = props.baseUrl || (client as unknown as { options: { baseUrl: string } }).options.baseUrl;
  const apiRoot = baseUrl.replace(/\/$/, '');

  const [messages, setMessages] = useState<Array<{ sender_type: string; message: string; created_at: string }>>([]);
  const [draft, setDraft] = useState('');
  const [face, setFace] = useState<FaceCheckRow[]>([]);
  const [status, setStatus] = useState<{ status?: string; paused_at?: string; scheduled_end?: string }>({});
  const [extraSeconds, setExtraSeconds] = useState(300);
  const [annot, setAnnot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chatRef = useRef<ProctorChatClient | null>(null);
  const liveVideoRef = useRef<LiveVideoSignaling | null>(null);
  const liveWatchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveConnectedRef = useRef(false);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewRevokeRef = useRef<string[]>([]);
  const violationRevokeRef = useRef<string[]>([]);

  const [hdr, setHdr] = useState<{ exam?: string; candidateName?: string; candidateEmail?: string }>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadLevel, setLoadLevel] = useState<string>('L0');
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const playbackTier = useMemo(
    () =>
      pickPlayerTier({
        watchingLive: liveConnected,
        snapshotUrl: previewUrl,
        loadLevel,
        focused: true,
      }),
    [previewUrl, loadLevel, liveConnected]
  );
  const [violationThumbs, setViolationThumbs] = useState<
    Array<{ id: string; url: string; caption: string; captured_at?: string }>
  >([]);
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
  const [violationFilter, setViolationFilter] = useState<string>('all');

  const statusTone = sessionStatusTone(status.status);
  const candidateLine = [hdr.candidateName, hdr.candidateEmail].filter(Boolean).join(' · ');
  const initials = candidateInitials(hdr.candidateName, hdr.candidateEmail);

  const filteredViolations = useMemo(() => {
    if (violationFilter === 'all') return violationThumbs;
    return violationThumbs.filter((v) => parseViolationCaption(v.caption).bucket === violationFilter);
  }, [violationThumbs, violationFilter]);

  const violationCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const v of violationThumbs) {
      cats.add(parseViolationCaption(v.caption).bucket);
    }
    return Array.from(cats);
  }, [violationThumbs]);

  const faceRows = useMemo(() => [...face].reverse().slice(0, 25), [face]);

  const fetchPanelData = useCallback(async () => {
    try {
      const [chat, faces, snaps] = await Promise.all([
        client.listSessionChat(sessionId, 100),
        client.listSessionFaceChecks(sessionId, 40),
        client.getSessionSnapshots(sessionId),
      ]);
      setMessages((chat.data as typeof messages) || []);
      setFace((faces.data as FaceCheckRow[]) || []);

      const snapRows = (snaps.data as SnapRow[]) || [];
      const loadSnapBlob = async (id: string) => {
        const res = await fetch(`${apiRoot}/v1/media/snapshots/${id}?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${bearerToken}` },
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return blob.size > 0 ? URL.createObjectURL(blob) : null;
      };

      const latestLive =
        snapRows.find((s) => s.source === 'live_preview' && (s.file_path || s.bytes)) ||
        snapRows.find((s) => s.file_path || (s.bytes != null && s.bytes > 0));
      if (latestLive?.id && bearerToken) {
        try {
          const objUrl = await loadSnapBlob(latestLive.id);
          if (objUrl) {
            previewRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
            previewRevokeRef.current = [objUrl];
            setPreviewUrl(objUrl);
            setPreviewErr(null);
          }
        } catch (e) {
          setPreviewErr((e as Error).message);
        }
      }

      const violationRows = snapRows
        .filter((s) => s.source === 'violation' || (s.source && s.source !== 'live_preview'))
        .slice(0, 24);
      if (bearerToken && violationRows.length) {
        const loaded = await Promise.all(
          violationRows.map(async (s) => {
            const url = await loadSnapBlob(s.id);
            if (!url) return null;
            return {
              id: s.id,
              url,
              caption: s.caption || 'Violation',
              captured_at: s.captured_at,
            };
          })
        );
        violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
        const valid = loaded.filter(Boolean) as Array<{
          id: string;
          url: string;
          caption: string;
          captured_at?: string;
        }>;
        violationRevokeRef.current = valid.map((v) => v.url);
        setViolationThumbs(valid);
      } else {
        violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
        violationRevokeRef.current = [];
        setViolationThumbs([]);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [client, sessionId, bearerToken, apiRoot]);

  useEffect(() => {
    void client
      .getSessionDetail(sessionId)
      .then((r) => {
        const d = r.data as {
          session?: {
            exam_title?: string;
            candidate_email?: string;
            candidate_name?: string;
            external_ref?: string;
          };
        };
        const s = d.session || {};
        setHdr({
          exam: s.exam_title || undefined,
          candidateEmail: s.candidate_email || s.external_ref || undefined,
          candidateName: s.candidate_name || undefined,
        });
      })
      .catch(() => {});
  }, [client, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchPanelData();
    };
    void tick();
    const pol = setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      clearInterval(pol);
      previewRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
      previewRevokeRef.current = [];
      violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
      violationRevokeRef.current = [];
    };
  }, [fetchPanelData]);

  useEffect(() => {
    const wsUrl = `${baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/v1/sdk/ws/sessions/${sessionId}`;
    chatRef.current = new ProctorChatClient({ wsUrl, token: bearerToken, asProctor: true });
    chatRef.current.connect();
    chatRef.current.on((msg) => {
      const t = (msg as { type?: string }).type;
      if (t === 'chat_message') {
        setMessages((prev) => [
          ...prev,
          msg as unknown as { sender_type: string; message: string; created_at: string },
        ]);
      }
      if (t === 'status') setStatus(msg as typeof status);
      if (t === 'ws_open') {
        liveVideoRef.current?.stop();
        void LiveVideoSignaling.create(client, {
          role: 'proctor',
          chat: chatRef.current!,
          getLocalStream: () => null,
          onRemoteStream: (stream) => {
            liveConnectedRef.current = true;
            setLiveConnected(true);
            if (liveWatchTimerRef.current) {
              clearInterval(liveWatchTimerRef.current);
              liveWatchTimerRef.current = null;
            }
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
              void remoteVideoRef.current.play().catch(() => {});
            }
          },
        }).then((sig) => {
          liveVideoRef.current = sig;
          sig.start();
          if (liveWatchTimerRef.current) clearInterval(liveWatchTimerRef.current);
          liveWatchTimerRef.current = setInterval(() => {
            if (!liveConnectedRef.current) chatRef.current?.send({ op: 'live_watch' });
          }, 12_000);
        });
      }
    });
    chatRef.current.pollStatus();
    const poll = setInterval(() => chatRef.current?.pollStatus(), 10_000);
    return () => {
      clearInterval(poll);
      if (liveWatchTimerRef.current) clearInterval(liveWatchTimerRef.current);
      liveWatchTimerRef.current = null;
      liveVideoRef.current?.stop();
      liveVideoRef.current = null;
      liveConnectedRef.current = false;
      setLiveConnected(false);
      chatRef.current?.close();
    };
  }, [sessionId, bearerToken, baseUrl, client]);

  const send = async () => {
    const m = draft.trim();
    if (!m) return;
    setDraft('');
    const sent = chatRef.current?.sendChat(m);
    if (!sent) {
      try {
        await client.postSessionChat(sessionId, m);
      } catch (e) {
        setErr((e as Error).message);
      }
    }
  };

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await fetchPanelData();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="proctor-root" style={{ ['--proctor-brand' as string]: brandPrimary }}>
      {lightbox && (
        <div
          className="evidence-lightbox"
          role="dialog"
          aria-modal
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightbox(null)}
        >
          <div className="evidence-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="evidence-lightbox-close" onClick={() => setLightbox(null)} aria-label="Close">
              ×
            </button>
            <img src={lightbox.url} alt="" className="evidence-lightbox-img" />
            <div className="evidence-lightbox-footer">{lightbox.title}{lightbox.subtitle ? ` · ${lightbox.subtitle}` : ''}</div>
          </div>
        </div>
      )}

      <header className="proctor-header">
        <div className="proctor-header-main">
          <nav className="proctor-breadcrumb" aria-label="Breadcrumb">
            <span className="proctor-breadcrumb-muted">Live</span>
            <span className="proctor-breadcrumb-sep">/</span>
            <span>{hdr.exam || 'Exam session'}</span>
          </nav>
          <div className="proctor-candidate-row">
            <div className="proctor-avatar" aria-hidden>
              {initials}
            </div>
            <div>
              <h2 className="proctor-candidate-name">{hdr.candidateName || 'Candidate'}</h2>
              {candidateLine && <p className="proctor-candidate-meta">{candidateLine}</p>}
            </div>
          </div>
        </div>
        <div className="proctor-header-badges">
          <span className={`proctor-pill proctor-pill-status proctor-pill-${statusTone}`}>
            {status.status || 'Unknown'}
          </span>
          <span className={`proctor-pill proctor-pill-stream ${liveConnected ? 'proctor-pill-live' : ''}`}>
            <IconLive />
            {liveConnected ? 'Stream live' : 'Connecting stream'}
          </span>
          <span className="proctor-pill proctor-pill-muted" title="Session id">
            {sessionId.slice(0, 8)}…
          </span>
        </div>
      </header>

      <div className="proctor-stats">
        <div className="proctor-stat">
          <span className="proctor-stat-value">{violationThumbs.length}</span>
          <span className="proctor-stat-label">Violation captures</span>
        </div>
        <div className="proctor-stat">
          <span className="proctor-stat-value">{face.length}</span>
          <span className="proctor-stat-label">Face checks</span>
        </div>
        <div className="proctor-stat">
          <span className="proctor-stat-value">{messages.length}</span>
          <span className="proctor-stat-label">Chat messages</span>
        </div>
        <div className="proctor-stat">
          <span className={`proctor-stat-value ${liveConnected ? 'proctor-stat-ok' : 'proctor-stat-warn'}`}>
            {liveConnected ? 'On' : '…'}
          </span>
          <span className="proctor-stat-label">WebRTC</span>
        </div>
      </div>

      <div className="proctor-layout">
        <main className="proctor-main">
          <section className="proctor-card proctor-video-card">
            <div className="proctor-card-head">
              <h3 className="proctor-card-title">
                <IconVideo />
                Live feed
              </h3>
              <span className="proctor-inline-muted" style={{ fontSize: 11 }}>
                Tier: {playbackTier.tier.replace(/_/g, ' ')}
              </span>
              {liveConnected && (
                <span className="proctor-live-badge">
                  <span className="proctor-live-dot" />
                  LIVE
                </span>
              )}
            </div>
            <div className="proctor-video-stage">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="proctor-video-el"
              />
              {!liveConnected && (
                <div className="proctor-video-overlay">
                  <div className="proctor-video-spinner" />
                  <p className="proctor-video-overlay-title">Connecting to candidate camera</p>
                  <p className="proctor-video-overlay-hint">
                    Keep this panel open while the candidate exam is running. WebRTC connects automatically.
                  </p>
                </div>
              )}
              {previewUrl && (
                <button
                  type="button"
                  className="proctor-pip"
                  title="Latest backup frame (~10s)"
                  onClick={() =>
                    setLightbox({
                      url: previewUrl,
                      title: 'Backup frame',
                      subtitle: 'Polled snapshot',
                    })
                  }
                >
                  <img src={previewUrl} alt="" />
                  <span>Backup</span>
                </button>
              )}
            </div>
            {!previewUrl && previewErr && (
              <p className="proctor-inline-muted">{previewErr}</p>
            )}
          </section>

          <section className="proctor-card">
            <div className="proctor-card-head">
              <h3 className="proctor-card-title">Violation timeline</h3>
              <span className="proctor-card-meta">{violationThumbs.length} captures</span>
            </div>
            {violationCategories.length > 1 && (
              <div className="proctor-filters">
                <button
                  type="button"
                  className={`evidence-chip ${violationFilter === 'all' ? 'evidence-chip-active' : ''}`}
                  onClick={() => setViolationFilter('all')}
                >
                  All
                </button>
                {violationCategories.includes('focus') && (
                  <button
                    type="button"
                    className={`evidence-chip ${violationFilter === 'focus' ? 'evidence-chip-active' : ''}`}
                    onClick={() => setViolationFilter('focus')}
                  >
                    Tab / focus
                  </button>
                )}
                {violationCategories.includes('gaze') && (
                  <button
                    type="button"
                    className={`evidence-chip ${violationFilter === 'gaze' ? 'evidence-chip-active' : ''}`}
                    onClick={() => setViolationFilter('gaze')}
                  >
                    Gaze
                  </button>
                )}
                {violationCategories.includes('object') && (
                  <button
                    type="button"
                    className={`evidence-chip ${violationFilter === 'object' ? 'evidence-chip-active' : ''}`}
                    onClick={() => setViolationFilter('object')}
                  >
                    Objects
                  </button>
                )}
                {violationCategories.includes('identity') && (
                  <button
                    type="button"
                    className={`evidence-chip ${violationFilter === 'identity' ? 'evidence-chip-active' : ''}`}
                    onClick={() => setViolationFilter('identity')}
                  >
                    Identity
                  </button>
                )}
                {violationCategories.includes('audio') && (
                  <button
                    type="button"
                    className={`evidence-chip ${violationFilter === 'audio' ? 'evidence-chip-active' : ''}`}
                    onClick={() => setViolationFilter('audio')}
                  >
                    Audio
                  </button>
                )}
              </div>
            )}
            {filteredViolations.length === 0 ? (
              <div className="proctor-empty">
                <p>No violation snapshots yet.</p>
                <p className="proctor-inline-muted">
                  AI and lockdown events (tab switch, gaze, phone, identity) appear here automatically.
                </p>
              </div>
            ) : (
              <div className="proctor-violation-grid">
                {filteredViolations.map((v) => {
                  const parsed = parseViolationCaption(v.caption);
                  const time = v.captured_at ? new Date(v.captured_at).toLocaleTimeString() : '';
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`proctor-violation-card proctor-violation-${parsed.severity}`}
                      onClick={() =>
                        setLightbox({
                          url: v.url,
                          title: parsed.label,
                          subtitle: time,
                        })
                      }
                    >
                      <img src={v.url} alt="" className="proctor-violation-img" />
                      <div className="proctor-violation-body">
                        <span className={`proctor-violation-tag proctor-tag-${parsed.severity}`}>
                          {parsed.label}
                        </span>
                        {time && <span className="proctor-violation-time">{time}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="proctor-card">
            <div className="proctor-card-head">
              <h3 className="proctor-card-title">Face & identity checks</h3>
              <span className="proctor-card-meta">Server AI · refreshed every 5s</span>
            </div>
            {faceRows.length === 0 ? (
              <div className="proctor-empty">
                <p>No face checks recorded yet.</p>
                <p className="proctor-inline-muted">Start the candidate exam with API and AI sidecar running.</p>
              </div>
            ) : (
              <div className="proctor-table-wrap">
                <table className="proctor-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Source</th>
                      <th>Faces</th>
                      <th>Match</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faceRows.map((f, i) => {
                      const match = formatMatchScore(f.match_score);
                      const faceOk = f.face_count === 1;
                      return (
                        <tr key={i}>
                          <td className="proctor-td-time">
                            {new Date(f.occurred_at).toLocaleTimeString()}
                          </td>
                          <td>
                            <span className="proctor-src-badge">{f.source || f.detector || '—'}</span>
                          </td>
                          <td>
                            <span className={`proctor-face-count ${faceOk ? 'ok' : 'bad'}`}>
                              {f.face_count}
                            </span>
                          </td>
                          <td>
                            {match ? (
                              <span
                                className={`proctor-match-pill ${
                                  parseFloat(match) >= 62 ? 'ok' : 'warn'
                                }`}
                              >
                                {match}
                              </span>
                            ) : (
                              <span className="proctor-inline-muted">—</span>
                            )}
                          </td>
                          <td className="proctor-td-flags">
                            {f.violations?.length
                              ? f.violations.map((x) => (
                                  <span key={x} className="proctor-flag-chip">
                                    {x.replace(/_/g, ' ')}
                                  </span>
                                ))
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        <aside className="proctor-sidebar">
          <section className="proctor-card proctor-controls-card">
            <h3 className="proctor-card-title">Session controls</h3>
            {err && <p className="proctor-error">{err}</p>}
            <div className="proctor-control-actions">
              <button
                type="button"
                className="proctor-btn proctor-btn-warn"
                disabled={busy}
                onClick={() => void wrap(() => client.pauseSession(sessionId))}
              >
                Pause exam
              </button>
              <button
                type="button"
                className="proctor-btn proctor-btn-success"
                disabled={busy}
                onClick={() => void wrap(() => client.resumeSession(sessionId))}
              >
                Resume
              </button>
              <button
                type="button"
                className="proctor-btn proctor-btn-danger"
                disabled={busy}
                onClick={() => void wrap(() => client.terminateSession(sessionId))}
              >
                Terminate
              </button>
            </div>
            <div className="proctor-field">
              <label htmlFor="proctor-extend">Extend time</label>
              <div className="proctor-field-row">
                <input
                  id="proctor-extend"
                  type="number"
                  min={30}
                  value={extraSeconds}
                  onChange={(e) => setExtraSeconds(parseInt(e.target.value, 10) || 0)}
                />
                <button
                  type="button"
                  className="proctor-btn proctor-btn-primary"
                  disabled={busy || !extraSeconds}
                  onClick={() => void wrap(() => client.extendSession(sessionId, extraSeconds))}
                >
                  Apply
                </button>
              </div>
              <span className="proctor-field-hint">Seconds added to scheduled end</span>
            </div>
            <div className="proctor-field">
              <label htmlFor="proctor-note">Proctor note</label>
              <textarea
                id="proctor-note"
                value={annot}
                onChange={(e) => setAnnot(e.target.value)}
                rows={3}
                placeholder="Document an observation for the audit trail…"
              />
              <button
                type="button"
                className="proctor-btn proctor-btn-primary proctor-btn-block"
                disabled={busy || !annot.trim()}
                onClick={() =>
                  void wrap(async () => {
                    await client.annotateSession(sessionId, annot.trim());
                    setAnnot('');
                  })
                }
              >
                Save note
              </button>
            </div>
          </section>

          <section className="proctor-card proctor-chat-card">
            <h3 className="proctor-card-title">Candidate chat</h3>
            <div className="proctor-chat-log">
              {messages.length === 0 ? (
                <p className="proctor-inline-muted">No messages yet. Send a warning or instruction below.</p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={`proctor-chat-bubble ${
                      m.sender_type === 'proctor' ? 'proctor-chat-out' : 'proctor-chat-in'
                    }`}
                  >
                    <div className="proctor-chat-meta">
                      {m.sender_type} · {new Date(m.created_at).toLocaleTimeString()}
                    </div>
                    <div>{m.message}</div>
                  </div>
                ))
              )}
            </div>
            <form
              className="proctor-chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message candidate…"
                aria-label="Chat message"
              />
              <button type="submit" className="proctor-btn proctor-btn-primary">
                Send
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
