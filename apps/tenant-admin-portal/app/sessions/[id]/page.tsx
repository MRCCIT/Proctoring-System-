'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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

type Tab = 'review' | 'evidence' | 'activity' | 'history';
type Decision = 'cleared' | 'flagged' | 'inconclusive';

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
  const playerRef = useRef<RecordingPlayerHandle>(null);
  const playheadRef = useRef<string | null>(null);

  const loadCore = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([
        api<{ data: { session: SessionRow; events: SessionEvent[] } }>('GET', `/v1/sessions/${id}`),
        api<{ data: ReviewHistoryRow[] }>('GET', `/v1/sessions/${id}/review`),
      ]);
      setSession(d.data.session);
      setEvents(d.data.events);
      setHistory(h.data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  const loadEvidence = useCallback(async () => {
    try {
      const r = await api<{ data: Evidence }>('GET', `/v1/sessions/${id}/evidence`);
      setEvidence(r.data);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void loadCore();
    void loadEvidence();
  }, [loadCore, loadEvidence]);

  const isLive = session ? ['active', 'paused'].includes(session.status) : false;
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => void loadCore(), 5000);
    return () => clearInterval(t);
  }, [isLive, loadCore]);

  useEffect(() => {
    const t = setInterval(() => void loadEvidence(), ((evidence?.expires_in_seconds || 900) - 60) * 1000);
    return () => clearInterval(t);
  }, [evidence?.expires_in_seconds, loadEvidence]);

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
    playerRef.current?.seekToInstant(ev.occurred_at);
  };

  if (!session) {
    return (
      <AuthGuard>
        <TenantAdminShell>{err ? <Alert tone="danger">{err}</Alert> : <Spinner label="Loading session…" />}</TenantAdminShell>
      </AuthGuard>
    );
  }

  const meta = session.integration_metadata
    ? Object.entries(session.integration_metadata).filter(([k]) => !k.startsWith('_'))
    : [];

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          breadcrumbs={[
            { href: '/sessions', label: 'Sessions' },
            ...(session.exam_id ? [{ href: `/exams/${session.exam_id}`, label: session.exam_title }] : []),
            { label: session.candidate_name },
          ]}
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
                description={hasRecording ? 'Select a detection to jump to that moment.' : undefined}
                actions={
                  <Button size="sm" variant="ghost" icon="flag" onClick={() => setIncidentOpen(true)}>
                    Record incident
                  </Button>
                }
              >
                {evidence ? (
                  hasRecording ? (
                    <RecordingPlayer
                      ref={playerRef}
                      recordings={evidence.recordings}
                      onUrlExpired={() => void loadEvidence()}
                      onTime={(t) => (playheadRef.current = t)}
                    />
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
                            <span className={`sev-${ev.severity}`}>● {SEVERITY_LABEL[ev.severity] || ev.severity}</span>
                            <span>{SOURCE_LABEL[ev.source] || ev.source}</span>
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
            <Card title={`Snapshots (${evidence?.snapshots.length || 0})`} description="Links are signed and expire after a few minutes; they refresh automatically.">
              {!evidence?.snapshots.length ? (
                <EmptyState icon="image" title="No snapshots" />
              ) : (
                <div className="snap-grid">
                  {evidence.snapshots.map((s) => (
                    <button key={s.id} type="button" className="snap-card" onClick={() => setLightbox(s)}>
                      {s.url ? <img src={s.url} alt={s.caption || 'snapshot'} loading="lazy" /> : null}
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
                    <span className={`sev-${ev.severity}`}>{SEVERITY_LABEL[ev.severity] || ev.severity}</span>
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

        <p className="ps-muted no-print" style={{ fontSize: 12, marginTop: 8 }}>
          <Link href="/sessions">← Back to sessions</Link>
        </p>
      </TenantAdminShell>
    </AuthGuard>
  );
}
