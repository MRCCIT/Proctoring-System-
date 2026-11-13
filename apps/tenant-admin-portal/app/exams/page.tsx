'use client';

import { useCallback, useEffect, useState } from 'react';
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
  TablePagination,
  Td,
  Toolbar,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ExamFormModal } from '@/components/ExamFormModal';
import { api, qs, type ExamRow, type Paged } from '@/lib/tenantApi';
import { relativeTime } from '@/lib/format';

const SOURCE_LABELS: Record<string, string> = {
  integration: 'Integration API',
  access_link: 'Candidate link',
  sdk: 'SDK',
  manual: 'Created here',
};

export default function ExamsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (append = false, next: string | null = null) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const r = await api<Paged<ExamRow>>(
          'GET',
          `/v1/exams${qs({ q: q.trim(), limit, next_cursor: append ? next : undefined })}`
        );
        setRows((prev) => (append ? [...prev, ...r.data] : r.data));
        setCursor(r.next_cursor);
        setTotal(r.total ?? null);
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [q, limit]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setModal(true);
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Exams"
          description="Exam contexts group proctoring sessions. They are created automatically by your integration (by external exam ID) or by candidate links, and can be added here."
          actions={
            <Button variant="primary" icon="plus" onClick={() => setModal(true)}>
              New exam
            </Button>
          }
        />
        <Card>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Search by exam name or external ID" />
          </Toolbar>
          {err && <p className="error">{err}</p>}
          <DataTable
            headers={['Exam', 'Source', 'Candidates', 'Sessions', 'Live', 'Needs review', 'Flagged', 'Last activity']}
            isEmpty={!loading && rows.length === 0}
            empty={
              <EmptyState
                icon="exam"
                title={q ? 'No exams match your search' : 'No exams yet'}
                description="Start a session from your assessment platform via the Integration API, share a candidate link, or create an exam here."
                action={
                  <Button variant="primary" icon="plus" onClick={() => setModal(true)}>
                    New exam
                  </Button>
                }
              />
            }
          >
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="ps-table-empty">
                  Loading exams…
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="ps-row-link" onClick={() => router.push(`/exams/${e.id}`)}>
                  <Td>
                    <div className="ps-cell-primary">{e.title}</div>
                    {e.external_exam_id && <div className="ps-cell-sub ps-mono">{e.external_exam_id}</div>}
                  </Td>
                  <Td>
                    <Badge>{SOURCE_LABELS[e.source] || e.source}</Badge>
                  </Td>
                  <Td>{e.candidate_count}</Td>
                  <Td>{e.session_count}</Td>
                  <Td>{e.live_count ? <Badge tone="success" dot>{e.live_count}</Badge> : <span className="ps-muted">0</span>}</Td>
                  <Td>{e.awaiting_review_count ? <Badge tone="warning">{e.awaiting_review_count}</Badge> : <span className="ps-muted">0</span>}</Td>
                  <Td>{e.flagged_count ? <Badge tone="high">{e.flagged_count}</Badge> : <span className="ps-muted">0</span>}</Td>
                  <Td muted nowrap>
                    {e.last_session_at ? relativeTime(e.last_session_at) : 'No sessions'}
                  </Td>
                </tr>
              ))
            )}
          </DataTable>
          <TablePagination
            mode="chunk"
            page={1}
            pageSize={limit}
            total={total != null ? total : rows.length}
            label={total != null ? `Showing ${rows.length} of ${total.toLocaleString()}` : rows.length ? `Showing ${rows.length}` : 'No results'}
            onPageChange={() => {}}
            onPageSizeChange={setLimit}
            hasMore={Boolean(cursor)}
            loadingMore={loadingMore}
            onLoadMore={() => void load(true, cursor)}
          />
        </Card>
        <ExamFormModal
          open={modal}
          onClose={() => setModal(false)}
          onSaved={(exam) => {
            setModal(false);
            router.push(`/exams/${exam.id}`);
          }}
        />
      </TenantAdminShell>
    </AuthGuard>
  );
}
