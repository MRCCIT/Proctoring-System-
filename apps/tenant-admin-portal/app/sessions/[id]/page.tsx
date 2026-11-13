'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  KeyValue,
  Modal,
  PageHeader,
  SeverityBadge,
  Spinner,
  StatCard,
  StatusBadge,
  Tabs,
  Td,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ReviewBadge } from '@/components/SessionsTable';
import { RecordingPlayer, type RecordingPlayerHandle } from '@/components/session/RecordingPlayer';
import {
  api,
  type Evidence,
  type EvidenceSnapshot,
  type ReviewHistoryRow,
  type SessionEvent,
  type SessionRow,
} from '@/lib/tenantApi';
import { decisionLabel, formatDateTime, formatDuration, formatOffset, formatTime, relativeTime } from '@/lib/format';
import { isSessionPresent, isSessionStatusLive } from '@/lib/sessionPresence';
import { usePageVisible } from '@/hooks/usePageVisible';

type Tab = 'review' | 'evidence' | 'activity' | 'history';
type Decision = 'cleared' | 'flagged' | 'inconclusive';

const SNAPSHOT_PAGE_SIZE = 48;

const SOURCE_LABEL: Record<string, string> = { ai: 'AI', browser: 'Browser', proctor: 'Proctor', system: 'System' };
const SEVERITY_LABEL: Record<string, string> = { flag: 'High', critical: 'Critical', warn: 'Medium', info: 'Info' };
const ACTION_LABEL: Record<string, string> = {
  review_started: 'Started review',
  session_cleared: 'Decision: no integrity concerns',
  session_flagged: 'Decision: integrity concern',
  session_inconclusive: 'Decision: inconclusive',
  event_confirmed: 'Confirmed detection',
  event_dismissed: 'Dismissed detection',
  event_reopened: 'Reopened detection',
  note: 'Added note',
  manual_incident: 'Recorded incident',
};

function nearestSnapshot(snaps: EvidenceSnapshot[], iso: string) {
  const t = new Date(iso).getTime();
  let best: EvidenceSnapshot | null = null;
  let bestD = Infinity;
  for (const s of snaps) {
    if (!s.url) continue;
    const d = Math.abs(new Date(s.captured_at).getTime() - t);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return bestD <= 20_000 ? best : null;
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const embed = searchParams?.get('embed') === '1';
  const [session, setSession] = useState<SessionRow | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [history, setHistory] = useState<ReviewHistoryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(true);
  const [dismissing, setDismissing] = useState<SessionEvent | null>(null);
  const [dismissNote, setDismissNote] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentNote, setIncidentNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [endOpen, setEndOpen] = useState(false);
  const [lightbox, setLightbox] = useState<EvidenceSnapshot | null>(null);
  const [snapPage, setSnapPage] = useState(0);
  const playerRef = useRef<RecordingPlayerHandle>(null);
  const playheadRef = useRef<string | null>(null);
  const pageVisible = usePageVisible();

  const loadCore = useCallback(async (opts?: { soft?: boolean }) => {
    try {
      const auth = opts?.soft ? 'soft' : 'hard';
      const [d, h] = await Promise.all([
        api<{ data: { session: SessionRow; events: SessionEvent[] } }>('GET', `/v1/sessions/${id}`, undefined, { auth }),
        api<{ data: ReviewHistoryRow[] }>('GET', `/v1/sessions/${id}/review`, undefined, { auth }),
      ]);
      setSession(d.data.session);
      setEvents(d.data.events);
      setHistory(h.data);
      setErr(null);
    } catch (e) {
      if (!opts?.soft) setErr((e as Error).message);
    }
  }, [id]);

  const loadEvidence = useCallback(async (opts?: { soft?: boolean }) => {
    try {
      const r = await api<{ data: Evidence }>(
        'GET',
        `/v1/sessions/${id}/evidence`,
        undefined,
        { auth: opts?.soft ? 'soft' : 'hard' }
      );
      setEvidence(r.data);
    } catch (e) {
      if (!opts?.soft) setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void loadCore();
    void loadEvidence();
  }, [loadCore, loadEvidence]);

  /** Status still Active/Paused (may be a zombie). Used for UI chrome. */
  const isLive = isSessionStatusLive(session);
  /** Candidate actually connected with fresh heartbeat — drives fast polling. */
  const present = isSessionPresent(session);

  useEffect(() => {
    if (!isLive || !pageVisible) return;
    const ms = present ? 5_000 : 60_000;
    const t = setInterval(() => void loadCore({ soft: true }), ms);
    return () => clearInterval(t);
  }, [isLive, present, pageVisible, loadCore]);

  useEffect(() => {
    if (!pageVisible) return;
    const ttl = Math.max(60, (evidence?.expires_in_seconds || 900) - 60);
    const t = setInterval(() => void loadEvidence({ soft: true }), ttl * 1000);
    return () => clearInterval(t);
  }, [evidence?.expires_in_seconds, loadEvidence, pageVisible]);

  useEffect(() => {
    setSnapPage(0);
  }, [id, evidence?.snapshots?.length]);

  useEffect(() => {
    if (session?.review_decision) setDecision(session.review_decision);
    if (session?.review_summary) setSummary(session.review_summary);
  }, [session?.review_decision, session?.review_summary]);

  const violations = useMemo(() => events.filter((e) => e.is_violation), [events]);
  const visibleViolations = showDismissed ? violations : violations.filter((v) => v.review_status !== 'dismissed');
  const counts = {
    open: violations.filter((v) => v.review_status === 'open').length,
    confirmed: violations.filter((v) => v.review_status === 'confirmed').length,
    dismissed: violations.filter((v) => v.review_status === 'dismissed').length,
  };
  const hasRecording = Boolean(evidence?.recordings.some((r) => r.url));
  const active = violations.find((v) => v.id === activeEvent) || null;
  const activeSnap = active && evidence ? nearestSnapshot(evidence.snapshots, active.occurred_at) : null;
  const allSnaps = evidence?.snapshots || [];
  const snapPageCount = Math.max(1, Math.ceil(allSnaps.length / SNAPSHOT_PAGE_SIZE));
  const safeSnapPage = Math.min(snapPage, snapPageCount - 1);
  const pageSnaps = allSnaps.slice(safeSnapPage * SNAPSHOT_PAGE_SIZE, (safeSnapPage + 1) * SNAPSHOT_PAGE_SIZE);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await loadCore();
      if (done) flash(done);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const reviewEvent = (ev: SessionEvent, action: 'confirm' | 'dismiss' | 'reopen', note?: string) =>
    run(`ev-${ev.id}`, () => api('POST', `/v1/sessions/${id}/events/${ev.id}/review`, { action, note }));

  const submitDecision = async () => {
    if (!decision) return;
    await run('decision', () => api('POST', `/v1/sessions/${id}/review/decision`, { decision, summary }), 'Decision saved');
  };

  const jump = (ev: SessionEvent) => {
    setActiveEvent(ev.id);
    // Defer one frame so the active-row paint cannot race the player seek,
    // and prefer recording-relative offset (matches the 00:01 labels).
    requestAnimationFrame(() => {
      const offset = ev.offset_seconds;
      if (offset != null && Number.isFinite(offset)) {
        playerRef.current?.seekToOffset(offset);
      } else if (ev.occurred_at) {
        playerRef.current?.seekToInstant(ev.occurred_at);
      }
    });
  };

  const Frame = ({ children }: { children: ReactNode }) =>
    embed ? (
      <AuthGuard>
        <div className="session-embed" style={{ padding: 12, minHeight: 480 }}>
          {children}
        </div>
      </AuthGuard>
    ) : (
      <AuthGuard>
        <TenantAdminShell>{children}</TenantAdminShell>
      </AuthGuard>
    );

  if (!session) {
    return <Frame>{err ? <Alert tone="danger">{err}</Alert> : <Spinner label="Loading session…" />}</Frame>;
  }

  const meta = session.integration_metadata
    ? Object.entries(session.integration_metadata).filter(([k]) => !k.startsWith('_'))
    : [];

  return (
    <Frame>
        <PageHeader
          breadcrumbs={
            embed
              ? undefined
              : [
                  { href: '/sessions', label: 'Sessions' },
                  ...(session.exam_id ? [{ href: `/exams/${session.exam_id}`, label: session.exam_title }] : []),
                  { label: session.candidate_name },
                ]
          }
          title={session.candidate_name}
          description={
            <>
              {session.exam_title}
              {session.candidate_email ? ` · ${session.candidate_email}` : ''}
              {session.external_attempt_id ? ` · Attempt ${session.external_attempt_id}` : ''}
            </>
          }
          meta={
            <>
              <StatusBadge status={session.status} />
              <ReviewBadge row={session} />
              {isLive && session.connection_state === 'disconnected' && <Badge tone="warning">Candidate disconnected</Badge>}
              {isLive && session.connection_state === 'connected' && <Badge tone="success">Connected</Badge>}
            </>
          }
          actions={
            <>
              {isLive && (
                <Button href={`/live?session=${session.id}`} icon="live">
                  Watch live
                </Button>
              )}
              <Button href={`/sessions/${session.id}/report`} icon="report">
                Integrity report
              </Button>
              {(isLive || session.status === 'scheduled') && (
                <Button variant="danger" onClick={() => setEndOpen(true)}>
                  End proctoring
                </Button>
              )}
            </>
          }
        />
        {err && (
          <Alert tone="danger" onClose={() => setErr(null)}>
            {err}
          </Alert>
        )}
        {toast && <Alert tone="success">{toast}</Alert>}

        <div className="ps-stats">
          <StatCard label="Started" value={<span style={{ fontSize: 18 }}>{formatDateTime(session.started_at)}</span>} hint={session.ended_at ? `Ended ${formatDateTime(session.ended_at)}` : isLive ? 'In progress' : 'Not started'} />
          <StatCard label="Duration" value={formatDuration(session.duration_seconds)} />
          <StatCard label="Violations" value={session.violation_count} tone={session.high_severity_count ? 'danger' : session.violation_count ? 'warning' : 'default'} hint={`${session.high_severity_count} high severity`} />
          <StatCard label="To review" value={counts.open} tone={counts.open ? 'warning' : 'success'} hint={`${counts.confirmed} confirmed · ${counts.dismissed} dismissed`} />
          <StatCard label="Evidence" value={evidence ? evidence.snapshots.length : '—'} hint={hasRecording ? 'Snapshots · recording available' : 'Snapshots · no recording'} />
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'review', label: 'Review', count: counts.open || null },
            { id: 'evidence', label: 'Evidence', count: evidence ? evidence.snapshots.length + evidence.recordings.length : null },
            { id: 'activity', label: 'Activity log', count: events.length },
            { id: 'history', label: 'Audit history', count: history.length },
          ]}
        />

        {tab === 'review' && (
          <div className="ps-grid ps-grid-main">
            <div>
              <Card
                title="Recording"
                description={
                  hasRecording
                    ? 'Camera (with mic voice) and screen play side-by-side. Select a detection to jump both to that moment.'
                    : undefined
                }
                actions={
                  <Button size="sm" variant="ghost" icon="flag" onClick={() => setIncidentOpen(true)}>
                    Record incident
                  </Button>
                }
              >
                {evidence ? (
                  hasRecording ? (
                    <>
                      <RecordingPlayer
                        ref={playerRef}
                        recordings={evidence.recordings}
                        onUrlExpired={() => void loadEvidence({ soft: true })}
                        onTime={(t) => (playheadRef.current = t)}
                      />
                      {active && activeSnap?.url ? (
                        <div
                          style={{
                            marginTop: 12,
                            display: 'grid',
                            gridTemplateColumns: '140px 1fr',
                            gap: 12,
                            alignItems: 'center',
                            padding: 10,
                            borderRadius: 10,
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                          }}
                        >
                          <img
                            src={activeSnap.url}
                            alt="Nearest snapshot"
                            style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontSize: 13 }}>Nearest snapshot at detection</strong>
                            <div className="ps-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                              {active.label} · {formatTime(activeSnap.captured_at)}
                              {active.offset_seconds != null ? ` · ${formatOffset(active.offset_seconds)}` : ''}
                            </div>
                            <div className="ps-muted" style={{ fontSize: 12, marginTop: 4 }}>
                              If the video does not jump (common for raw WebM), this frame is the closest evidence.
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : activeSnap?.url ? (
                    <div>
                      <img src={activeSnap.url} alt="Snapshot near detection" style={{ width: '100%', borderRadius: 10 }} />
                      <p className="ps-muted" style={{ margin: '8px 0 0' }}>
                        Nearest snapshot · {formatTime(activeSnap.captured_at)}
                      </p>
                    </div>
                  ) : (
                    <EmptyState
                      icon="video"
                      title="No recording for this session"
                      description="Select a detection to see the closest snapshot, or open the Evidence tab."
                    />
                  )
                ) : (
                  <Spinner />
                )}
              </Card>

              <Card
                title={`Detections (${violations.length})`}
                description="Automated and browser signals. Confirm what you verified on the recording; dismiss with a reason otherwise."
                actions={
                  <label className="ps-check" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
                    Show dismissed
                  </label>
                }
                flush
              >
                {visibleViolations.length === 0 ? (
                  <EmptyState icon="check" title="No detections" description="No violations were recorded for this session." />
                ) : (
                  <div className="vt-list">
                    {visibleViolations.map((ev) => (
                      <div
                        key={ev.id}
                        className={`vt-row${ev.id === activeEvent ? ' active' : ''}${ev.review_status === 'dismissed' ? ' dismissed' : ''}`}
                        onClick={() => jump(ev)}
                      >
                        <span className={`vt-time${ev.offset_seconds == null ? ' na' : ''}`} title={formatDateTime(ev.occurred_at)}>
                          {ev.offset_seconds == null ? formatTime(ev.occurred_at).slice(0, 5) : formatOffset(ev.offset_seconds)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="vt-label">{ev.label}</div>
                          <div className="vt-meta">
                            <SeverityBadge severity={ev.severity}>
                              {SEVERITY_LABEL[ev.severity] || ev.severity}
                            </SeverityBadge>
                            <Badge tone="neutral">{SOURCE_LABEL[ev.source] || ev.source}</Badge>
                            <span>{formatTime(ev.occurred_at)}</span>
                            {ev.review_status !== 'open' && (
                              <Badge tone={ev.review_status === 'confirmed' ? 'danger' : 'neutral'}>
                                {ev.review_status === 'confirmed' ? 'Confirmed' : 'Dismissed'}
                              </Badge>
                            )}
                          </div>
                          {ev.review_note && <div className="vt-note">“{ev.review_note}” — {ev.reviewed_by}</div>}
                        </div>
                        <div className="vt-actions" onClick={(e) => e.stopPropagation()}>
                          {ev.review_status === 'open' ? (
                            <>
                              <Button size="sm" variant="danger" loading={busy === `ev-${ev.id}`} onClick={() => void reviewEvent(ev, 'confirm')}>
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setDismissing(ev);
                                  setDismissNote('');
                                }}
                              >
                                Dismiss
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" loading={busy === `ev-${ev.id}`} onClick={() => void reviewEvent(ev, 'reopen')}>
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div>
              <Card title="Integrity decision" description="Your decision is shared with the assessment platform via webhook. It is not an exam result.">
                {session.review_status === 'reviewed' && (
                  <Alert tone={session.review_decision === 'flagged' ? 'danger' : session.review_decision === 'inconclusive' ? 'warning' : 'success'} title={decisionLabel(session.review_decision) || 'Reviewed'}>
                    By {session.reviewed_by} · {relativeTime(session.reviewed_at)}
                  </Alert>
                )}
                {counts.open > 0 && session.review_status !== 'reviewed' && (
                  <Alert tone="warning">{counts.open} detection{counts.open === 1 ? '' : 's'} still open.</Alert>
                )}
                <div className="decision-grid">
                  {(
                    [
                      ['cleared', 'No concerns', 'Signals explained'],
                      ['flagged', 'Concern', 'Needs follow-up'],
                      ['inconclusive', 'Inconclusive', 'Not enough evidence'],
                    ] as const
                  ).map(([k, title, sub]) => (
                    <button key={k} type="button" className={`decision-opt${decision === k ? ` sel-${k}` : ''}`} onClick={() => setDecision(k)}>
                      <strong>{title}</strong>
                      <span>{sub}</span>
                    </button>
                  ))}
                </div>
                <Field label="Summary" hint={decision && decision !== 'cleared' ? 'Required for concerns and inconclusive outcomes.' : 'Optional for “No concerns”.'}>
                  <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What did you observe on the recording?" />
                </Field>
                <Button
                  variant="primary"
                  className="auth-submit"
                  disabled={!decision || (decision !== 'cleared' && !summary.trim())}
                  loading={busy === 'decision'}
                  onClick={() => void submitDecision()}
                >
                  {session.review_status === 'reviewed' ? 'Update decision' : 'Save decision'}
                </Button>
              </Card>

              <Card title="Session details">
                <KeyValue
                  items={[
                    { label: 'Session ID', value: <span className="ps-mono">{session.id.slice(0, 8)}…</span> },
                    { label: 'Candidate ID', value: session.external_candidate_id || session.external_ref || '—' },
                    { label: 'Exam ID', value: session.external_exam_id || '—' },
                    { label: 'Attempt', value: session.external_attempt_id || '—' },
                    { label: 'Created', value: formatDateTime(session.created_at) },
                    { label: 'Last heartbeat', value: relativeTime(session.last_heartbeat_at) },
                    ...meta.slice(0, 6).map(([k, v]) => ({ label: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) })),
                  ]}
                />
              </Card>
            </div>
          </div>
        )}

        {tab === 'evidence' && (
          <>
            <Card title="Recordings" flush>
              <DataTable
                headers={['Track', 'File', 'Started', 'Size', '']}
                isEmpty={!evidence?.recordings.length}
                empty="No recordings uploaded for this session."
              >
                {evidence?.recordings.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Badge tone="brand">{r.track}</Badge>
                    </Td>
                    <Td mono>{r.display_name}</Td>
                    <Td muted>{formatDateTime(r.started_at)}</Td>
                    <Td muted>{r.bytes ? `${(r.bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</Td>
                    <Td align="right">
                      {r.url && (
                        <Button size="sm" icon="download" href={r.url}>
                          Open
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </Card>
            <Card
              title={`Snapshots (${allSnaps.length})`}
              description="Links are signed and expire after a few minutes; they refresh automatically. Showing a page at a time to keep the browser stable."
            >
              {!allSnaps.length ? (
                <EmptyState icon="image" title="No snapshots" />
              ) : (
                <>
                  <div className="snap-grid">
                    {pageSnaps.map((s) => (
                      <button key={s.id} type="button" className="snap-card" onClick={() => setLightbox(s)}>
                        {s.url ? <img src={s.url} alt={s.caption || 'snapshot'} loading="lazy" decoding="async" /> : null}
                        <div>
                          <strong>{formatTime(s.captured_at)}</strong>
                          {s.offset_seconds != null && <span className="ps-muted"> · {formatOffset(s.offset_seconds)}</span>}
                          <div className="ps-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.source === 'live_preview' ? 'Periodic frame' : s.caption || s.source}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {snapPageCount > 1 ? (
                    <div className="ps-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
                      <span className="ps-muted">
                        Page {safeSnapPage + 1} of {snapPageCount} · {pageSnaps.length} shown
                      </span>
                      <div className="ps-row" style={{ gap: 8 }}>
                        <Button size="sm" disabled={safeSnapPage <= 0} onClick={() => setSnapPage((p) => Math.max(0, p - 1))}>
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          disabled={safeSnapPage >= snapPageCount - 1}
                          onClick={() => setSnapPage((p) => Math.min(snapPageCount - 1, p + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </Card>
          </>
        )}

        {tab === 'activity' && (
          <Card flush title="Activity log" description="Every event recorded for this session, including informational ones.">
            <DataTable headers={['Time', 'Event', 'Source', 'Severity', 'Review']} isEmpty={!events.length} empty="No events yet.">
              {[...events].reverse().map((ev) => (
                <tr key={ev.id}>
                  <Td nowrap muted>
                    {formatTime(ev.occurred_at)}
                  </Td>
                  <Td>
                    <div>{ev.label}</div>
                    <div className="ps-cell-sub ps-mono">{ev.event_type}</div>
                  </Td>
                  <Td>{SOURCE_LABEL[ev.source] || ev.source}</Td>
                  <Td>
                    <SeverityBadge severity={ev.severity}>{SEVERITY_LABEL[ev.severity] || ev.severity}</SeverityBadge>
                  </Td>
                  <Td>{ev.is_violation ? <StatusBadge status={ev.review_status === 'open' ? 'pending' : ev.review_status} label={ev.review_status} /> : <span className="ps-muted">—</span>}</Td>
                </tr>
              ))}
            </DataTable>
          </Card>
        )}

        {tab === 'history' && (
          <div className="ps-grid ps-grid-main">
            <Card title="Audit history" description="Every review action, who took it and when.">
              {history.length === 0 ? (
                <EmptyState icon="clock" title="No review activity yet" />
              ) : (
                history.map((h) => (
                  <div key={h.id} className="history-item">
                    <span className="history-dot" />
                    <div>
                      <div>
                        <strong>{ACTION_LABEL[h.action] || h.action}</strong>
                        <span className="ps-muted"> · {h.actor_email || h.actor_id || h.actor_type} · {formatDateTime(h.created_at)}</span>
                      </div>
                      {h.note && <div style={{ color: 'var(--ps-text-2)' }}>{h.note}</div>}
                    </div>
                  </div>
                ))
              )}
            </Card>
            <Card title="Add a reviewer note">
              <Field label="Note">
                <textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Visible to your organization's reviewers only." />
              </Field>
              <Button
                variant="primary"
                disabled={!noteText.trim()}
                loading={busy === 'note'}
                onClick={async () => {
                  const ok = await run('note', () => api('POST', `/v1/sessions/${id}/review/notes`, { note: noteText }), 'Note added');
                  if (ok) setNoteText('');
                }}
              >
                Add note
              </Button>
            </Card>
          </div>
        )}

        <Modal
          open={Boolean(dismissing)}
          onClose={() => setDismissing(null)}
          title="Dismiss detection"
          description={dismissing ? `${dismissing.label} at ${formatTime(dismissing.occurred_at)}` : undefined}
          footer={
            <>
              <Button onClick={() => setDismissing(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!dismissNote.trim()}
                loading={busy === `ev-${dismissing?.id}`}
                onClick={async () => {
                  if (!dismissing) return;
                  const ok = await reviewEvent(dismissing, 'dismiss', dismissNote.trim());
                  if (ok) setDismissing(null);
                }}
              >
                Dismiss
              </Button>
            </>
          }
        >
          <Field label="Reason" required hint="Recorded in the audit history and the integrity report.">
            <textarea rows={3} value={dismissNote} onChange={(e) => setDismissNote(e.target.value)} placeholder="e.g. Candidate looked at the provided formula sheet." autoFocus />
          </Field>
        </Modal>

        <Modal
          open={incidentOpen}
          onClose={() => setIncidentOpen(false)}
          title="Record an incident"
          description={playheadRef.current ? `At the current recording position (${formatTime(playheadRef.current)}).` : 'At the current time.'}
          footer={
            <>
              <Button onClick={() => setIncidentOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!incidentNote.trim()}
                loading={busy === 'incident'}
                onClick={async () => {
                  const ok = await run(
                    'incident',
                    () => api('POST', `/v1/sessions/${id}/incidents`, { note: incidentNote, occurred_at: playheadRef.current || undefined }),
                    'Incident recorded'
                  );
                  if (ok) {
                    setIncidentOpen(false);
                    setIncidentNote('');
                  }
                }}
              >
                Record incident
              </Button>
            </>
          }
        >
          <Field label="What did you observe?" required>
            <textarea rows={4} value={incidentNote} onChange={(e) => setIncidentNote(e.target.value)} autoFocus />
          </Field>
        </Modal>

        <Modal
          open={endOpen}
          onClose={() => setEndOpen(false)}
          title="End proctoring for this session?"
          description="Monitoring and recording stop for the candidate. This does not submit or close the assessment in your platform."
          footer={
            <>
              <Button onClick={() => setEndOpen(false)}>Cancel</Button>
              <Button
                variant="danger"
                loading={busy === 'end'}
                onClick={async () => {
                  const ok = await run('end', () => api('POST', `/v1/sessions/${id}/terminate`), 'Proctoring ended');
                  if (ok) setEndOpen(false);
                }}
              >
                End proctoring
              </Button>
            </>
          }
        />

        <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} title={lightbox ? formatDateTime(lightbox.captured_at) : ''} width={900}>
          {lightbox?.url && <img src={lightbox.url} alt="snapshot" style={{ width: '100%', borderRadius: 8 }} />}
          {lightbox?.caption && <p className="ps-muted">{lightbox.caption}</p>}
          {lightbox && hasRecording && (
            <Button
              icon="play"
              onClick={() => {
                const at = lightbox.captured_at;
                setLightbox(null);
                setTab('review');
                setTimeout(() => playerRef.current?.seekToInstant(at), 50);
              }}
            >
              Play recording from here
            </Button>
          )}
        </Modal>

        {!embed && (
          <p className="ps-muted no-print" style={{ fontSize: 12, marginTop: 8 }}>
            <Link href="/sessions">← Back to sessions</Link>
          </p>
        )}
    </Frame>
  );
}
