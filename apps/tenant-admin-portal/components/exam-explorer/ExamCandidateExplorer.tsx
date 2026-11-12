'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProctorLiveView } from '@proctorshield/sdk/admin-panel';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  Spinner,
  StatusBadge,
} from '@proctorshield/ui-components';
import { ReviewBadge, SessionsTable } from '@/components/SessionsTable';
import {
  CandidateBoardView,
  CandidateGridView,
  CandidateTimelineView,
  CandidateWallView,
} from './CandidateViewModes';
import { getClient, tenantTokens, API_BASE } from '@/lib/api';
import { api, qs, type ExamRow, type Paged, type SessionRow } from '@/lib/tenantApi';
import type { ExamExplorerMode } from './ExamListView';

export type CandidateViewMode = 'list' | 'grid' | 'wall' | 'board' | 'timeline';

const VIEW_STORAGE_KEY = 'ps_exam_candidate_view';

function ReviewSessionPanel({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    api<{ data: { session: SessionRow } }>('GET', `/v1/sessions/${sessionId}`)
      .then((r) => {
        setSession(r.data.session);
        setErr('');
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <Spinner label="Loading session…" />;
  if (err) return <p className="error">{err}</p>;
  if (!session) return <EmptyState icon="sessions" title="Session not found" description="This session may have been removed." />;

  const fullHref = `/sessions/${sessionId}`;

  return (
    <>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>{session.candidate_name}</h3>
      <div className="ps-row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatusBadge status={session.status} />
        <ReviewBadge row={session} />
        <Badge tone={session.violation_count ? 'danger' : 'neutral'}>{session.violation_count} violations</Badge>
        {session.risk_score != null && <Badge>Risk {Math.round(Number(session.risk_score))}</Badge>}
      </div>
      <p className="ps-muted" style={{ marginTop: 0 }}>
        Review recording, violations, and evidence in the full review player. This panel keeps your place in the exam queue.
      </p>
      <iframe
        title={`Review preview ${session.candidate_name}`}
        src={fullHref}
        style={{
          width: '100%',
          minHeight: 420,
          border: '1px solid var(--ps-border)',
          borderRadius: 8,
          marginBottom: 12,
          background: 'var(--ps-surface)',
        }}
      />
      <Button variant="primary" href={fullHref} icon="external">
        Open full review player
      </Button>
    </>
  );
}

function loadPreferredView(mode: ExamExplorerMode): CandidateViewMode {
  try {
    const raw = localStorage.getItem(`${VIEW_STORAGE_KEY}:${mode}`);
    if (raw === 'list' || raw === 'grid' || raw === 'wall' || raw === 'board' || raw === 'timeline') return raw;
  } catch {
    /* ignore */
  }
  return 'list';
}

export function ExamCandidateExplorer({
  mode,
  examId,
  selectedSessionId,
}: {
  mode: ExamExplorerMode;
  examId: string;
  selectedSessionId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<CandidateViewMode>('list');
  const [tileRows, setTileRows] = useState<SessionRow[]>([]);
  const [tilesLoading, setTilesLoading] = useState(false);
  const [tileCursor, setTileCursor] = useState<string | null>(null);

  const basePath = mode === 'live' ? '/live' : '/reviews';

  useEffect(() => {
    setView(loadPreferredView(mode));
  }, [mode]);

  useEffect(() => {
    api<{ data: ExamRow }>('GET', `/v1/exams/${examId}`)
      .then((r) => setExam(r.data))
      .catch((e) => setErr((e as Error).message));
  }, [examId]);

  const setViewPersist = (v: CandidateViewMode) => {
    setView(v);
    try {
      localStorage.setItem(`${VIEW_STORAGE_KEY}:${mode}`, v);
    } catch {
      /* ignore */
    }
    const sp = new URLSearchParams(searchParams?.toString() || '');
    sp.set('view', v);
    router.replace(`?${sp.toString()}`);
  };

  useEffect(() => {
    const fromUrl = searchParams?.get('view') as CandidateViewMode | null;
    if (fromUrl && ['list', 'grid', 'wall', 'board', 'timeline'].includes(fromUrl)) {
      setView(fromUrl);
    }
  }, [searchParams]);

  const fixedFilters = useMemo(() => {
    if (mode === 'live') return { status: 'active,paused' };
    const tab = searchParams?.get('tab') || 'pending';
    if (tab === 'reviewed') return { review_status: 'reviewed' };
    if (tab === 'in_review') return { review_status: 'in_review', status: 'completed,terminated,failed' };
    return { review_status: 'pending', status: 'completed,terminated,failed' };
  }, [mode, searchParams]);

  const fixedKey = JSON.stringify(fixedFilters);

  const loadTiles = useCallback(
    async (append = false, next: string | null = null) => {
      setTilesLoading(true);
      try {
        const r = await api<Paged<SessionRow>>(
          'GET',
          `/v1/exams/${examId}/sessions${qs({
            limit: 50,
            next_cursor: append ? next : undefined,
            ...JSON.parse(fixedKey),
          })}`
        );
        setTileRows((prev) => (append ? [...prev, ...r.data] : r.data));
        setTileCursor(r.next_cursor);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setTilesLoading(false);
      }
    },
    [examId, fixedKey]
  );

  useEffect(() => {
    if (view === 'grid' || view === 'wall' || view === 'board' || view === 'timeline') {
      void loadTiles(false);
      if (mode === 'live' && view !== 'timeline') {
        const t = setInterval(() => void loadTiles(false), 10_000);
        return () => clearInterval(t);
      }
    }
  }, [view, loadTiles, mode]);

  const hrefFor = (sessionId: string) => `${basePath}/exams/${examId}/candidates/${sessionId}`;

  const token = tenantTokens.get();
  const viewOptions: { id: CandidateViewMode; label: string; liveOnly?: boolean; reviewOnly?: boolean }[] = [
    { id: 'list', label: 'List' },
    { id: 'grid', label: 'Grid' },
    { id: 'wall', label: 'Wall', liveOnly: true },
    { id: 'board', label: 'Severity board' },
    { id: 'timeline', label: 'Timeline', reviewOnly: true },
  ];

  const emptyTitle = mode === 'live' ? 'No live candidates' : 'No candidates in this queue';
  const emptyDescription =
    mode === 'live'
      ? 'Candidates appear when they start proctoring for this exam.'
      : 'Completed sessions for this exam appear here until reviewed.';

  return (
    <>
      <PageHeader
        title={exam?.title || 'Exam workspace'}
        description={
          mode === 'live'
            ? 'Live candidates for this exam. Open a row to watch camera, chat, and control the session.'
            : 'Candidates awaiting integrity review for this exam.'
        }
        breadcrumbs={[
          { href: basePath, label: mode === 'live' ? 'Live monitoring' : 'Review queue' },
          { label: exam?.title || 'Exam' },
          ...(selectedSessionId ? [{ label: 'Candidate' }] : []),
        ]}
        actions={
          <>
            <Button href={basePath} icon="chevronLeft">
              All exams
            </Button>
            {exam && (
              <Button href={`/exams/${exam.id}/report`} icon="report">
                Report
              </Button>
            )}
            {exam && (
              <Button href={`/exams/${exam.id}`} icon="exam">
                Exam settings
              </Button>
            )}
          </>
        }
        meta={
          exam ? (
            <span className="ps-row" style={{ gap: 8 }}>
              {mode === 'live' ? (
                <Badge tone="success" dot>
                  {exam.live_count} live
                </Badge>
              ) : (
                <Badge tone="warning">{exam.awaiting_review_count} needs review</Badge>
              )}
              {exam.flagged_count > 0 && <Badge tone="danger">{exam.flagged_count} flagged</Badge>}
              {(exam.critical_violation_count || 0) > 0 && (
                <Badge tone="danger">{exam.critical_violation_count} critical</Badge>
              )}
              <Badge>{exam.review_progress_pct ?? 100}% reviewed</Badge>
            </span>
          ) : (
            <Skeleton width={180} height={16} />
          )
        }
      />
      {err && <p className="error">{err}</p>}

      <div className="ps-row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {viewOptions
          .filter((o) => (o.liveOnly ? mode === 'live' : true) && (o.reviewOnly ? mode === 'review' : true))
          .map((o) => (
            <Button key={o.id} size="sm" variant={view === o.id ? 'primary' : 'ghost'} onClick={() => setViewPersist(o.id)}>
              {o.label}
            </Button>
          ))}
        {mode === 'review' && (
          <span className="ps-row" style={{ gap: 6, marginLeft: 'auto' }}>
            {(['pending', 'in_review', 'reviewed'] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={(searchParams?.get('tab') || 'pending') === tab ? 'primary' : 'ghost'}
                onClick={() => {
                  const sp = new URLSearchParams(searchParams?.toString() || '');
                  sp.set('tab', tab);
                  router.replace(`?${sp.toString()}`);
                }}
              >
                {tab === 'pending' ? 'Needs review' : tab === 'in_review' ? 'In progress' : 'Decided'}
              </Button>
            ))}
          </span>
        )}
      </div>

      <div className={selectedSessionId ? 'live-page-shell' : undefined}>
        <div className={selectedSessionId ? 'live-sessions-panel' : undefined}>
          {view === 'list' ? (
            <Card>
              <SessionsTable
                examId={examId}
                showExam={false}
                dense
                fixedFilters={fixedFilters}
                refreshMs={mode === 'live' ? 8_000 : undefined}
                getSessionHref={(s) => hrefFor(s.id)}
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
              />
            </Card>
          ) : (
            <Card>
              {tilesLoading && tileRows.length === 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={view === 'wall' ? 72 : 96} />
                  ))}
                </div>
              ) : view === 'grid' ? (
                <CandidateGridView rows={tileRows} hrefFor={hrefFor} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
              ) : view === 'wall' ? (
                <CandidateWallView rows={tileRows} hrefFor={hrefFor} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
              ) : view === 'board' ? (
                <CandidateBoardView rows={tileRows} hrefFor={hrefFor} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
              ) : view === 'timeline' ? (
                <CandidateTimelineView rows={tileRows} hrefFor={hrefFor} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
              ) : (
                <EmptyState icon="sessions" title="Unsupported view" description="Switch back to list." />
              )}
              {tileCursor && (
                <div style={{ marginTop: 12 }}>
                  <Button size="sm" loading={tilesLoading} onClick={() => void loadTiles(true, tileCursor)}>
                    Load more
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>

        {mode === 'live' && selectedSessionId && (
          <div className="live-proctor-panel">
            {!token ? (
              <Spinner label="Loading credentials…" />
            ) : (
              <ProctorLiveView
                key={selectedSessionId}
                client={getClient()}
                bearerToken={token}
                baseUrl={API_BASE}
                sessionId={selectedSessionId}
              />
            )}
            <div style={{ marginTop: 12 }}>
              <Button href={`/sessions/${selectedSessionId}`} icon="external">
                Open full session page
              </Button>
            </div>
          </div>
        )}

        {mode === 'review' && selectedSessionId && (
          <Card className="live-proctor-panel">
            <ReviewSessionPanel sessionId={selectedSessionId} />
          </Card>
        )}
      </div>
    </>
  );
}
