'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  DataTable,
  EmptyState,
  PageHeader,
  Skeleton,
  Td,
  TablePagination,
  useClientPagination,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type CandidateRow = {
  id: string;
  email?: string | null;
  name?: string | null;
  external_ref?: string | null;
  sessions_count?: number;
  last_session_at?: string | null;
  last_exam_title?: string | null;
};

export default function CandidatesPage() {
  const [items, setItems] = useState<CandidateRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .listCandidates()
      .then((r) => setItems((r.data as CandidateRow[]) || []))
      .catch((e) => {
        setErr((e as Error).message);
        setItems([]);
      });
  }, []);

  const pager = useClientPagination(items || [], 15);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Candidates"
          description="People who start a proctored exam are listed here automatically — no manual import."
        />
        {err && <Alert tone="danger">{err}</Alert>}
        <DataTable
          headers={['Candidate', 'Email', 'Exam activity', 'Last session', 'ID']}
          isEmpty={items !== null && !pager.pageItems.length}
          empty={
            <EmptyState
              icon="users"
              title="No candidates yet"
              description="When a candidate starts an exam (SDK or candidate link), they appear here."
            />
          }
        >
          {items === null
            ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <Skeleton height={16} />
                  </td>
                </tr>
              ))
            : pager.pageItems.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <div className="ps-cell-primary">{c.name || c.external_ref || 'Unnamed'}</div>
                    {c.external_ref && c.name ? (
                      <div className="ps-cell-sub ps-mono">{c.external_ref}</div>
                    ) : null}
                  </Td>
                  <Td>{c.email || '—'}</Td>
                  <Td>
                    <div className="ps-cell-primary">{c.sessions_count ?? 0} session{(c.sessions_count ?? 0) === 1 ? '' : 's'}</div>
                    {c.last_exam_title ? <div className="ps-cell-sub">{c.last_exam_title}</div> : null}
                  </Td>
                  <Td nowrap>{c.last_session_at ? formatDateTime(c.last_session_at) : '—'}</Td>
                  <Td>
                    <span className="ps-mono ps-muted">{String(c.id).slice(0, 8)}…</span>
                  </Td>
                </tr>
              ))}
        </DataTable>
        {items && items.length > 0 && (
          <TablePagination
            page={pager.page}
            pageSize={pager.pageSize}
            total={pager.total}
            pageCount={pager.pageCount}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
          />
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
