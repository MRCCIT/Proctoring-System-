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
import type { TenantSummary } from '@proctorshield/shared-types';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount, pct, relativeTime } from '@/lib/format';

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    getClient()
      .listTenants(cursor)
      .then((r) => {
        setTenants((prev) => (cursor && prev ? [...prev, ...r.data] : r.data));
        setNext(r.next_cursor);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!tenants) return [];
    const needle = q.trim().toLowerCase();
    return tenants.filter((t) => {
      if (status && t.status !== status) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.slug.toLowerCase().includes(needle) ||
        (t.contact_email || '').toLowerCase().includes(needle) ||
        t.id.toLowerCase().includes(needle)
      );
    });
  }, [tenants, q, status]);

  const summary = useMemo(() => {
    const list = tenants || [];
    return {
      total: list.length,
      active: list.filter((t) => t.status === 'active').length,
      live: list.reduce((n, t) => n + Number(t.usage?.active_sessions || 0), 0),
      sessions: list.reduce((n, t) => n + Number(t.usage?.total_sessions || 0), 0),
      storage: list.reduce((n, t) => n + Number(t.usage?.storage_bytes_used || 0), 0),
    };
  }, [tenants]);

  const pager = useClientPagination(filtered, 10);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title="Tenants"
          description="Provision organizations, monitor usage, and open tenant-level analytics."
          actions={
            <>
              <Button icon="refresh" onClick={() => load()}>
                Refresh
              </Button>
              <Button href="/tenants/new" variant="primary" icon="plus">
                Create tenant
              </Button>
            </>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!tenants ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div className="ps-stat" key={i}>
                <Skeleton width={90} />
                <div style={{ height: 10 }} />
                <Skeleton height={28} width={60} />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Organizations"
                value={formatCount(summary.total)}
                hint={`${formatCount(summary.active)} active`}
                icon={<Icon name="building" />}
                tone="info"
              />
              <StatCard
                label="Live sessions"
                value={formatCount(summary.live)}
                hint="Across listed tenants"
                icon={<Icon name="live" />}
                tone={summary.live ? 'success' : 'default'}
              />
              <StatCard
                label="Sessions all time"
                value={formatCount(summary.sessions)}
                icon={<Icon name="sessions" />}
              />
              <StatCard
                label="Storage used"
                value={formatBytes(summary.storage)}
                icon={<Icon name="server" />}
              />
              <StatCard
                label="Suspended"
                value={formatCount(summary.total - summary.active)}
                icon={<Icon name="alert" />}
                tone={summary.total - summary.active > 0 ? 'warning' : 'default'}
              />
            </>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <Card flush>
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder="Search name, slug, email or ID" />
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <span className="ps-toolbar-spacer" />
              <span className="ps-muted" style={{ fontSize: 13 }}>
                {tenants ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : 'Loading…'}
              </span>
            </Toolbar>

            <DataTable
              headers={['Tenant', 'Status', 'Live', 'Sessions', 'Success', 'Storage', 'Updated', '']}
              isEmpty={Boolean(tenants) && filtered.length === 0}
              empty={
                <EmptyState
                  icon="building"
                  title="No tenants match"
                  description="Try clearing search or create a new organization."
                  action={
                    <Button href="/tenants/new" variant="primary" icon="plus">
                      Create tenant
                    </Button>
                  }
                />
              }
            >
              {!tenants
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="ps-table-empty">
                        <Skeleton height={16} />
                      </td>
                    </tr>
                  ))
                : pager.pageItems.map((t) => (
                    <tr
                      key={t.id}
                      className="ps-row-link"
                      onClick={() => router.push(`/tenants/${t.id}`)}
                    >
                      <Td>
                        <div className="ps-cell-primary">{t.name}</div>
                        <div className="ps-cell-sub ps-mono">{t.slug}</div>
                      </Td>
                      <Td>
                        <StatusBadge status={t.status} />
                      </Td>
                      <Td>
                        {t.usage.active_sessions ? (
                          <strong>{formatCount(t.usage.active_sessions)}</strong>
                        ) : (
                          <span className="ps-muted">0</span>
                        )}
                      </Td>
                      <Td>{formatCount(t.usage.total_sessions)}</Td>
                      <Td>{pct(t.usage.session_success_rate)}</Td>
                      <Td nowrap>{formatBytes(t.usage.storage_bytes_used)}</Td>
                      <Td muted nowrap>
                        {relativeTime(t.updated_at)}
                      </Td>
                      <Td nowrap>
                        <span className="ps-row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            onClick={() => router.push(`/tenants/${t.id}`)}
                          >
                            Details
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            icon="external"
                            disabled={t.status === 'suspended'}
                            onClick={() => {
                              void getClient()
                                .impersonateTenant(t.id)
                                .then((r) => {
                                  window.open(r.data.handoff_url, '_blank', 'noopener,noreferrer');
                                })
                                .catch((e) => setErr((e as Error).message));
                            }}
                          >
                            Portal
                          </Button>
                        </span>
                      </Td>
                    </tr>
                  ))}
            </DataTable>

            {tenants && (
              <TablePagination
                page={pager.page}
                pageSize={pager.pageSize}
                total={pager.total}
                pageCount={pager.pageCount}
                onPageChange={pager.setPage}
                onPageSizeChange={pager.setPageSize}
              />
            )}

            {next && (
              <div style={{ padding: '0 14px 14px' }}>
                <Button size="sm" loading={loadingMore} onClick={() => load(next)}>
                  Fetch more from server
                </Button>
              </div>
            )}
          </Card>
        </div>
      </SuperAdminShell>
    </AuthGuard>
  );
}
