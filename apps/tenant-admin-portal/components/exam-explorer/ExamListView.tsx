'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DEFAULT_PAGE_SIZE,
  EmptyState,
  PageHeader,
  SearchInput,
  Skeleton,
  TablePagination,
  Td,
  Toolbar,
} from '@proctorshield/ui-components';
import { api, qs, type ExamRow, type Paged } from '@/lib/tenantApi';
import { formatDateTime, relativeTime } from '@/lib/format';

export type ExamExplorerMode = 'live' | 'review';

function examStatus(
  e: ExamRow,
  mode: ExamExplorerMode
): { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' | 'danger' } {
  if (mode === 'live') {
    if (e.live_count > 0) return { label: 'Live', tone: 'success' };
    if (e.ends_at && new Date(e.ends_at).getTime() < Date.now()) return { label: 'Ended', tone: 'neutral' };
    if (e.starts_at && new Date(e.starts_at).getTime() > Date.now()) return { label: 'Scheduled', tone: 'info' };
    if (e.session_count === 0) return { label: 'Scheduled', tone: 'info' };
    return { label: 'Recently active', tone: 'neutral' };
  }
  const awaiting = Number(e.awaiting_review_count ?? e.review_pending ?? 0);
  const done = Number(e.review_done ?? 0);
  const progress = e.review_progress_pct != null ? Number(e.review_progress_pct) : awaiting + done === 0 ? 100 : Math.round((100 * done) / (awaiting + done));
  if (awaiting > 0) return { label: 'Needs review', tone: 'warning' };
  if (e.flagged_count > 0) return { label: 'Flagged cases', tone: 'danger' };
  if (done > 0 && progress >= 100) return { label: 'Reviewed', tone: 'success' };
  if (done > 0) return { label: 'In review', tone: 'info' };
  if ((e.session_count || 0) === 0) return { label: 'No sessions', tone: 'neutral' };
  return { label: 'Reviewed', tone: 'success' };
}

function scheduleLabel(e: ExamRow) {
  if (e.starts_at || e.ends_at) {
    const start = e.starts_at ? formatDateTime(e.starts_at) : '—';
    const end = e.ends_at ? formatDateTime(e.ends_at) : '—';
    return `${start} → ${end}`;
  }
  return e.last_session_at ? `Last activity ${relativeTime(e.last_session_at)}` : 'No schedule';
}

export function ExamListView({ mode }: { mode: ExamExplorerMode }) {
  const router = useRouter();
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

  const basePath = mode === 'live' ? '/live' : '/reviews';

  const load = useCallback(
    async (append = false, next: string | null = null) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const r = await api<Paged<ExamRow>>(
          'GET',
          `/v1/exams${qs({ q: q.trim(), limit, next_cursor: append ? next : undefined })}`
        );
        let data = r.data;
        if (mode === 'live') {
          data = [...data].sort(
            (a, b) => b.live_count - a.live_count || (b.last_session_at || '').localeCompare(a.last_session_at || '')
          );
        } else {
          data = [...data].sort(
            (a, b) =>
              (b.awaiting_review_count || 0) - (a.awaiting_review_count || 0) ||
              (b.critical_violation_count || 0) - (a.critical_violation_count || 0) ||
              b.flagged_count - a.flagged_count
          );
        }
        setRows((prev) => (append ? [...prev, ...data] : data));
        setCursor(r.next_cursor);
        setTotal(r.total ?? null);
        setErr('');
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [q, limit, mode]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const title = mode === 'live' ? 'Live monitoring' : 'Review queue';
  const description =
    mode === 'live'
      ? 'Pick an exam workspace, then watch candidates in real time. Lists stay exam-scoped for scale.'
      : 'Pick an exam with pending integrity reviews, then work candidate-by-candidate.';

  const filteredHint = useMemo(() => {
    if (mode === 'live') return rows.filter((e) => e.live_count > 0).length;
    return rows.filter((e) => (e.awaiting_review_count || 0) > 0).length;
  }, [rows, mode]);

  const headers =
    mode === 'live'
      ? ['Exam', 'Status', 'Schedule', 'Candidates', 'Online', 'Flagged', 'Critical', 'Review %', '']
      : ['Exam', 'Status', 'Schedule', 'Candidates', 'Needs review', 'Flagged', 'Critical', 'Review %', ''];

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button icon="refresh" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      <Card>
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search exams by name or external ID" />
          <span className="ps-muted" style={{ fontSize: 13 }}>
            {mode === 'live'
              ? `${filteredHint} exam${filteredHint === 1 ? '' : 's'} with live candidates on this page`
              : `${filteredHint} exam${filteredHint === 1 ? '' : 's'} with pending reviews on this page`}
          </span>
        </Toolbar>
        {err && <p className="error">{err}</p>}
        <DataTable
          headers={headers}
          isEmpty={!loading && rows.length === 0}
          empty={
            <EmptyState
              icon={mode === 'live' ? 'live' : 'review'}
              title={mode === 'live' ? 'No exams yet' : 'No exams to review'}
              description={
                mode === 'live'
                  ? 'When candidates start proctoring, their exam contexts appear here.'
                  : 'Completed sessions awaiting a decision will appear under their exam.'
              }
            />
          }
        >
          {loading && rows.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={headers.length} className="ps-table-empty">
                  <Skeleton height={18} />
                </td>
              </tr>
            ))
          ) : (
            rows.map((e) => {
              const st = examStatus(e, mode);
              const progress = e.review_progress_pct ?? 100;
              return (
                <tr
                  key={e.id}
                  className="ps-row-link"
                  onClick={() => router.push(`${basePath}/exams/${e.id}/candidates`)}
                >
                  <Td>
                    <div className="ps-cell-primary">{e.title}</div>
                    {e.external_exam_id && <div className="ps-cell-sub ps-mono">{e.external_exam_id}</div>}
                  </Td>
                  <Td>
                    <Badge tone={st.tone} dot={st.tone === 'success'}>
                      {st.label}
                    </Badge>
                  </Td>
                  <Td muted nowrap>
                    {scheduleLabel(e)}
                  </Td>
                  <Td>{e.candidate_count}</Td>
                  <Td>
                    {mode === 'live' ? (
                      e.live_count ? (
                        <Badge tone="success" dot>
                          {e.live_count}
                        </Badge>
                      ) : (
                        <span className="ps-muted">0</span>
                      )
                    ) : e.awaiting_review_count ? (
                      <Badge tone="warning">{e.awaiting_review_count}</Badge>
                    ) : (
                      <span className="ps-muted">0</span>
                    )}
                  </Td>
                  <Td>
                    {e.flagged_count ? <Badge tone="high">{e.flagged_count}</Badge> : <span className="ps-muted">0</span>}
                  </Td>
                  <Td>
                    {(e.critical_violation_count || 0) > 0 ? (
                      <Badge tone="critical">{e.critical_violation_count}</Badge>
                    ) : (
                      <span className="ps-muted">0</span>
                    )}
                  </Td>
                  <Td nowrap>
                    <span title={`${e.review_done || 0} reviewed / ${(e.review_done || 0) + (e.review_pending || e.awaiting_review_count || 0)}`}>
                      {progress}%
                    </span>
                  </Td>
                  <Td nowrap>
                    <Button
                      size="sm"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        router.push(`${basePath}/exams/${e.id}/candidates`);
                      }}
                    >
                      Open workspace
                    </Button>
                  </Td>
                </tr>
              );
            })
          )}
        </DataTable>
        <TablePagination
          mode="chunk"
          page={1}
          pageSize={limit}
          total={total != null ? total : rows.length}
          label={
            total != null
              ? `Showing ${rows.length} of ${total.toLocaleString()}`
              : rows.length
                ? `Showing ${rows.length}`
                : 'No results'
          }
          onPageChange={() => {}}
          onPageSizeChange={setLimit}
          hasMore={Boolean(cursor)}
          loadingMore={loadingMore}
          onLoadMore={() => void load(true, cursor)}
        />
      </Card>
    </>
  );
}
