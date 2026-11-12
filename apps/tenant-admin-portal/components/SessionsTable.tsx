'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  DataTable,
  DEFAULT_PAGE_SIZE,
  EmptyState,
  SearchInput,
  Skeleton,
  StatusBadge,
  TablePagination,
  Td,
  Toolbar,
} from '@proctorshield/ui-components';
import { api, qs, type Paged, type SessionRow } from '@/lib/tenantApi';
import { decisionLabel, formatDateTime, formatDuration, relativeTime } from '@/lib/format';

export function ReviewBadge({ row }: { row: Pick<SessionRow, 'review_status' | 'review_decision' | 'status'> }) {
  if (row.review_status === 'reviewed') {
    const tone = row.review_decision === 'flagged' ? 'danger' : row.review_decision === 'inconclusive' ? 'warning' : 'success';
    return <Badge tone={tone}>{decisionLabel(row.review_decision) || 'Reviewed'}</Badge>;
  }
  if (row.review_status === 'in_review') return <Badge tone="info">In review</Badge>;
  if (['completed', 'terminated', 'failed'].includes(row.status)) return <Badge tone="warning">Needs review</Badge>;
  return <span className="ps-muted">—</span>;
}

export function ViolationCount({ row }: { row: Pick<SessionRow, 'violation_count' | 'high_severity_count'> }) {
  if (!row.violation_count) return <span className="ps-muted">0</span>;
  return (
    <span className="ps-row" style={{ gap: 6 }}>
      <strong>{row.violation_count}</strong>
      {row.high_severity_count > 0 && <Badge tone="danger">{row.high_severity_count} high</Badge>}
    </span>
  );
}

export interface SessionsTableProps {
  examId?: string;
  fixedFilters?: Record<string, string>;
  showExam?: boolean;
  showFilters?: boolean;
  /** Dense explorer columns: risk, severity, reviewer, last activity */
  dense?: boolean;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  refreshMs?: number;
  /** Where a row click navigates. Defaults to `/sessions/:id`. */
  getSessionHref?: (row: SessionRow) => string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active,paused', label: 'Live' },
  { value: 'scheduled', label: 'Not started' },
  { value: 'completed', label: 'Completed' },
  { value: 'terminated,failed', label: 'Ended early' },
];

const REVIEW_OPTIONS = [
  { value: '', label: 'Any review state' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In review' },
  { value: 'reviewed', label: 'Reviewed' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'Any severity' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export function SessionsTable({
  examId,
  fixedFilters = {},
  showExam = true,
  showFilters = true,
  dense = false,
  pageSize = DEFAULT_PAGE_SIZE,
  emptyTitle = 'No sessions yet',
  emptyDescription = 'Sessions appear here as soon as a candidate starts proctoring through your integration or a candidate link.',
  refreshMs,
  getSessionHref,
}: SessionsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(() => searchParams?.get('q') || '');
  const [status, setStatus] = useState(() => searchParams?.get('status') || '');
  const [review, setReview] = useState(() => searchParams?.get('review_status') || '');
  const [severity, setSeverity] = useState(() => searchParams?.get('highest_severity') || '');
  const [flaggedOnly, setFlaggedOnly] = useState(() => searchParams?.get('has_violations') === '1');
  const [sort, setSort] = useState(() => searchParams?.get('sort') || (dense ? 'risk' : ''));
  const [limit, setLimit] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const fixedKey = JSON.stringify(fixedFilters);

  const path = examId ? `/v1/exams/${examId}/sessions` : '/v1/sessions';

  const syncUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(searchParams?.toString() || '');
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`?${sp.toString()}`);
    },
    [router, searchParams]
  );

  const load = useCallback(
    async (append = false, nextCursor: string | null = null) => {
      const id = ++reqId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const r = await api<Paged<SessionRow>>(
          'GET',
          `${path}${qs({
            limit,
            next_cursor: append ? nextCursor : undefined,
            q: q.trim() || undefined,
            status: status || undefined,
            review_status: review || undefined,
            highest_severity: severity || undefined,
            has_violations: flaggedOnly || undefined,
            sort: sort || undefined,
            ...JSON.parse(fixedKey),
          })}`
        );
        if (id !== reqId.current) return;
        setRows((prev) => (append ? [...prev, ...r.data] : r.data));
        setCursor(r.next_cursor);
        setTotal(r.total ?? null);
        setError(null);
        if (!append) setSelected({});
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [path, limit, q, status, review, severity, flaggedOnly, sort, fixedKey]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(false), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => void load(false), refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const headers = dense
    ? [
        '',
        'Candidate',
        ...(showExam ? ['Exam'] : []),
        'Status',
        'Risk',
        'Severity',
        'Violations',
        'Last activity',
        'Reviewer',
        'Review',
      ]
    : ['Candidate', ...(showExam ? ['Exam'] : []), 'Status', 'Started', 'Duration', 'Violations', 'Evidence', 'Review'];

  const runBulk = async (action: 'assign_reviewer' | 'flag' | 'message', extra?: { note?: string; message?: string }) => {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    setBulkMsg('');
    try {
      const r = await api<{ data: { ok: number; failed: number; action: string } }>('POST', '/v1/sessions/bulk', {
        action,
        session_ids: selectedIds,
        ...extra,
      });
      const { ok, failed } = r.data;
      setBulkMsg(
        failed
          ? `${action}: ${ok} succeeded, ${failed} failed.`
          : `${action.replace('_', ' ')} applied to ${ok} session${ok === 1 ? '' : 's'}.`
      );
      setSelected({});
      await load(false);
    } catch (e) {
      setBulkMsg((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const onBulk = (kind: 'assign_reviewer' | 'flag' | 'message') => {
    if (kind === 'assign_reviewer') void runBulk('assign_reviewer');
    else if (kind === 'flag') {
      const note = typeof window !== 'undefined' ? window.prompt('Optional note for bulk flag:', '') : '';
      if (note === null) return;
      void runBulk('flag', { note: note.trim() || undefined });
    } else {
      const message = typeof window !== 'undefined' ? window.prompt('Message for selected candidates:', '') : '';
      if (message === null || !message.trim()) return;
      void runBulk('message', { message: message.trim() });
    }
  };

  const openRow = (idx: number) => {
    const s = rows[idx];
    if (!s) return;
    router.push(getSessionHref ? getSessionHref(s) : `/sessions/${s.id}`);
  };

  const onTableKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(rows.length - 1, i < 0 ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i <= 0 ? 0 : i - 1));
    } else if (e.key === 'Enter' && focusIdx >= 0) {
      e.preventDefault();
      openRow(focusIdx);
    }
  };

  useEffect(() => {
    if (focusIdx >= rows.length) setFocusIdx(rows.length ? rows.length - 1 : -1);
  }, [rows.length, focusIdx]);

  return (
    <div>
      {showFilters && (
        <Toolbar>
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              syncUrl({ q: v || undefined });
            }}
            placeholder="Search candidate, email, exam or session ID"
          />
          {!fixedFilters.status && (
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                syncUrl({ status: e.target.value || undefined });
              }}
              aria-label="Status filter"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {!fixedFilters.review_status && (
            <select
              value={review}
              onChange={(e) => {
                setReview(e.target.value);
                syncUrl({ review_status: e.target.value || undefined });
              }}
              aria-label="Review filter"
            >
              {REVIEW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {dense && (
            <>
              <select
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value);
                  syncUrl({ highest_severity: e.target.value || undefined });
                }}
                aria-label="Severity filter"
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  syncUrl({ sort: e.target.value || undefined });
                }}
                aria-label="Sort"
              >
                <option value="">Newest</option>
                <option value="risk">Risk score</option>
              </select>
            </>
          )}
          <label className="ps-check">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => {
                setFlaggedOnly(e.target.checked);
                syncUrl({ has_violations: e.target.checked ? '1' : undefined });
              }}
            />
            With violations
          </label>
          <span className="ps-toolbar-spacer" />
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => void load(false)}>
            Refresh
          </Button>
        </Toolbar>
      )}

      {dense && selectedIds.length > 0 && (
        <div className="ps-row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Badge tone="brand">{selectedIds.length} selected</Badge>
          <Button size="sm" loading={bulkBusy} onClick={() => onBulk('assign_reviewer')}>
            Assign reviewer
          </Button>
          <Button size="sm" variant="ghost" loading={bulkBusy} onClick={() => onBulk('flag')}>
            Bulk flag
          </Button>
          <Button size="sm" variant="ghost" loading={bulkBusy} onClick={() => onBulk('message')}>
            Bulk message
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
            Clear
          </Button>
          {bulkMsg && <span className="ps-muted" style={{ fontSize: 12 }}>{bulkMsg}</span>}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div
        ref={tableWrapRef}
        tabIndex={dense ? 0 : undefined}
        onKeyDown={dense ? onTableKeyDown : undefined}
        onFocus={dense ? () => setFocusIdx((i) => (i < 0 && rows.length ? 0 : i)) : undefined}
        style={dense ? { outline: 'none' } : undefined}
        aria-label={dense ? 'Sessions list. Use arrow keys to move, Enter to open.' : undefined}
      >
      <DataTable
        headers={headers}
        isEmpty={!loading && rows.length === 0}
        empty={<EmptyState icon="sessions" title={emptyTitle} description={emptyDescription} />}
      >
        {loading && rows.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={headers.length} className="ps-table-empty">
                <Skeleton height={16} />
              </td>
            </tr>
          ))
        ) : (
          rows.map((s, idx) => (
            <tr
              key={s.id}
              className="ps-row-link"
              style={dense && focusIdx === idx ? { outline: '2px solid var(--ps-brand)', outlineOffset: -2 } : undefined}
              onClick={() => openRow(idx)}
            >
              {dense && (
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.candidate_name}`}
                    checked={Boolean(selected[s.id])}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                  />
                </Td>
              )}
              <Td>
                <div className="ps-cell-primary">{s.candidate_name}</div>
                <div className="ps-cell-sub">
                  {s.candidate_email || s.external_candidate_id || s.external_ref || s.id.slice(0, 8)}
                </div>
              </Td>
              {showExam && (
                <Td>
                  <div>{s.exam_title}</div>
                  {s.external_attempt_id && <div className="ps-cell-sub">Attempt {s.external_attempt_id}</div>}
                </Td>
              )}
              <Td>
                <StatusBadge status={s.status} />
                {s.connection_state === 'disconnected' && ['active', 'paused'].includes(s.status) && (
                  <div className="ps-cell-sub" style={{ color: 'var(--ps-warning)' }}>
                    Disconnected
                  </div>
                )}
              </Td>
              {dense ? (
                <>
                  <Td nowrap>{Math.round(Number(s.risk_score || 0))}</Td>
                  <Td>
                    {s.highest_severity ? (
                      <Badge
                        tone={
                          String(s.highest_severity).toUpperCase() === 'CRITICAL' ||
                          String(s.highest_severity).toUpperCase() === 'HIGH' ||
                          String(s.highest_severity).toUpperCase() === 'FLAG'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {String(s.highest_severity).toUpperCase()}
                      </Badge>
                    ) : (
                      <span className="ps-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <ViolationCount row={s} />
                  </Td>
                  <Td muted nowrap>
                    {s.last_heartbeat_at || s.ended_at || s.started_at
                      ? relativeTime(s.last_heartbeat_at || s.ended_at || s.started_at)
                      : '—'}
                  </Td>
                  <Td muted>{s.reviewed_by || '—'}</Td>
                  <Td>
                    <ReviewBadge row={s} />
                  </Td>
                </>
              ) : (
                <>
                  <Td nowrap muted>
                    {formatDateTime(s.started_at || s.created_at)}
                  </Td>
                  <Td nowrap>{formatDuration(s.duration_seconds)}</Td>
                  <Td>
                    <ViolationCount row={s} />
                  </Td>
                  <Td>
                    <span className="ps-row" style={{ gap: 6 }}>
                      {s.has_recording ? <Badge tone="brand">Video</Badge> : null}
                      {s.snapshot_count ? <Badge>{s.snapshot_count} img</Badge> : null}
                      {!s.has_recording && !s.snapshot_count && <span className="ps-muted">—</span>}
                    </span>
                  </Td>
                  <Td>
                    <ReviewBadge row={s} />
                  </Td>
                </>
              )}
            </tr>
          ))
        )}
      </DataTable>
      </div>
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
        onPageSizeChange={(n) => setLimit(n)}
        hasMore={Boolean(cursor)}
        loadingMore={loadingMore}
        onLoadMore={() => void load(true, cursor)}
      />
    </div>
  );
}
