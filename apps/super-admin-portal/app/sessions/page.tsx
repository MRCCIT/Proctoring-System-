'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  PageHeader,
  SearchInput,
  Skeleton,
  StatCard,
  StatusBadge,
  TablePagination,
  Td,
  Toolbar,
  useClientPagination,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import { formatCount, formatDateTime, relativeTime } from '@/lib/format';

type ActiveSession = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_slug?: string;
  status: string;
  connection_state?: string | null;
  exam_title?: string | null;
  exam_id?: string | null;
  external_ref?: string | null;
  started_at?: string | null;
  last_heartbeat_at?: string | null;
  violation_flags?: number;
};

export default function ActiveSessionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ActiveSession[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const load = (c?: string) => {
    if (c) setLoadingMore(true);
    getClient()
      .listActiveSessionsSa(c)
      .then((r) => {
        const rows = r.data as ActiveSession[];
        setItems((prev) => (c && prev ? [...prev, ...rows] : rows));
        setNext(r.next_cursor);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 20_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((s) => {
      if (flaggedOnly && !(Number(s.violation_flags) > 0)) return false;
      if (!needle) return true;
      return (
        (s.exam_title || '').toLowerCase().includes(needle) ||
        (s.tenant_name || '').toLowerCase().includes(needle) ||
        (s.tenant_slug || '').toLowerCase().includes(needle) ||
        (s.external_ref || '').toLowerCase().includes(needle) ||
        s.id.toLowerCase().includes(needle)
      );
    });
  }, [items, q, flaggedOnly]);

  const pager = useClientPagination(filtered, 10);

  const summary = useMemo(() => {
    const list = items || [];
    const tenants = new Set(list.map((s) => s.tenant_id));
    return {
      live: list.length,
      tenants: tenants.size,
      flagged: list.filter((s) => Number(s.violation_flags) > 0).length,
      connected: list.filter((s) => String(s.connection_state || s.status).toLowerCase() === 'connected' || s.status === 'active')
        .length,
    };
  }, [items]);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title="Active sessions"
          description="Live proctoring sessions across every tenant. Refreshes automatically every 20s."
          actions={
            <Button icon="refresh" onClick={() => load()}>
              Refresh
            </Button>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!items ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div className="ps-stat" key={i}>
                <Skeleton width={90} />
                <div style={{ height: 10 }} />
                <Skeleton height={28} width={60} />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Live now"
                value={formatCount(summary.live)}
                hint="Loaded active sessions"
                icon={<Icon name="live" />}
                tone={summary.live ? 'success' : 'default'}
              />
              <StatCard
                label="Tenants"
                value={formatCount(summary.tenants)}
                hint="With active sessions"
                icon={<Icon name="building" />}
                tone="info"
              />
              <StatCard
                label="Connected"
                value={formatCount(summary.connected)}
                icon={<Icon name="sessions" />}
              />
              <StatCard
                label="Flagged"
                value={formatCount(summary.flagged)}
                hint="With violation flags"
                icon={<Icon name="alert" />}
                tone={summary.flagged ? 'warning' : 'default'}
              />
            </>
          )}
        </div>

        <Card flush>
          <Toolbar>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search exam, tenant or session ID"
            />
            <label className="ps-inline" style={{ fontSize: 13, gap: 6 }}>
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(e) => setFlaggedOnly(e.target.checked)}
              />
              Flagged only
            </label>
            <span className="ps-toolbar-spacer" />
            <span className="ps-muted" style={{ fontSize: 13 }}>
              {items ? `Showing ${filtered.length} of ${items.length}` : 'Loading…'}
            </span>
          </Toolbar>

          {!items && !err ? (
            <div style={{ padding: 24 }}>
              <Skeleton height={180} />
            </div>
          ) : (
            <DataTable
              headers={['Exam', 'Tenant', 'Status', 'Flags', 'Started', 'Heartbeat', '']}
              isEmpty={!filtered.length}
              empty={
                <EmptyState
                  icon="live"
                  title="No active sessions"
                  description="When candidates are being proctored, they appear here in real time."
                />
              }
            >
              {pager.pageItems.map((s) => (
                <tr
                  key={s.id}
                  className="ps-row-link"
                  onClick={() => router.push(`/sessions/${s.id}`)}
                >
                  <Td>
                    <div className="ps-cell-primary">{s.exam_title || 'Untitled exam'}</div>
                    <div className="ps-cell-sub ps-mono">{s.id.slice(0, 8)}</div>
                  </Td>
                  <Td>
                    <div className="ps-cell-primary">{s.tenant_name || '—'}</div>
                    <div className="ps-cell-sub ps-mono">{s.tenant_slug}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={s.connection_state || s.status} />
                  </Td>
                  <Td>
                    {Number(s.violation_flags) > 0 ? (
                      <strong>{formatCount(s.violation_flags)}</strong>
                    ) : (
                      <span className="ps-muted">0</span>
                    )}
                  </Td>
                  <Td muted nowrap>
                    {formatDateTime(s.started_at)}
                  </Td>
                  <Td muted nowrap>
                    {relativeTime(s.last_heartbeat_at)}
                  </Td>
                  <Td nowrap>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/sessions/${s.id}`);
                      }}
                    >
                      Open
                    </Button>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}

          {items && (
            <>
              <TablePagination
                page={pager.page}
                pageSize={pager.pageSize}
                total={pager.total}
                pageCount={pager.pageCount}
                onPageChange={pager.setPage}
                onPageSizeChange={pager.setPageSize}
              />
              {next && (
                <div style={{ padding: '0 14px 14px' }}>
                  <Button size="sm" loading={loadingMore} onClick={() => load(next)}>
                    Fetch more from server
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
