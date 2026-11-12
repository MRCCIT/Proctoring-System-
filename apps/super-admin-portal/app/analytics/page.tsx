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
import type { TenantCompareRow } from '@/lib/analyticsTypes';
import { formatBytes, formatCount } from '@/lib/format';

function successPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(Number(rate))) return '—';
  return `${Math.round(Number(rate) * 100)}%`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TenantCompareRow[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    getClient()
      .getTenantsCompare()
      .then((r) => setRows(r.data || []))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.slug.toLowerCase().includes(needle) ||
        r.tenant_id.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status]);

  const summary = useMemo(() => {
    const list = rows || [];
    return {
      total: list.length,
      active: list.filter((r) => r.status === 'active').length,
      live: list.reduce((n, r) => n + Number(r.active_sessions || 0), 0),
      violations: list.reduce((n, r) => n + Number(r.violation_flags_sum || 0), 0),
      storage: list.reduce((n, r) => n + Number(r.storage_bytes || 0), 0),
      awaiting: list.reduce((n, r) => n + Number(r.awaiting_review || 0), 0),
    };
  }, [rows]);

  const pager = useClientPagination(filtered, 10);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title="Tenant comparison"
          actions={
            <>
              <Button href="/tenants" icon="building">
                Tenants
              </Button>
              <Button
                icon="refresh"
                onClick={() => {
                  setRows(null);
                  setErr('');
                  getClient()
                    .getTenantsCompare()
                    .then((r) => setRows(r.data || []))
                    .catch((e) => setErr((e as Error).message));
                }}
              >
                Refresh
              </Button>
            </>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!rows ? (
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
                label="Tenants"
                value={formatCount(summary.total)}
                hint={`${formatCount(summary.active)} active`}
                icon={<Icon name="building" />}
                tone="info"
              />
              <StatCard
                label="Live sessions"
                value={formatCount(summary.live)}
                hint="Across all tenants"
                icon={<Icon name="live" />}
                tone={summary.live ? 'success' : 'default'}
              />
              <StatCard
                label="Violation flags"
                value={formatCount(summary.violations)}
                icon={<Icon name="alert" />}
                tone={summary.violations > 0 ? 'warning' : 'default'}
              />
              <StatCard
                label="Awaiting review"
                value={formatCount(summary.awaiting)}
                icon={<Icon name="review" />}
                tone={summary.awaiting > 0 ? 'warning' : 'default'}
              />
              <StatCard
                label="Storage used"
                value={formatBytes(summary.storage)}
                icon={<Icon name="server" />}
              />
            </>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <Card flush>
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder="Search tenant name, slug or ID" />
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <span className="ps-toolbar-spacer" />
              <span className="ps-muted" style={{ fontSize: 13 }}>
                {rows ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : 'Loading…'}
              </span>
            </Toolbar>

            <DataTable
              headers={[
                'Tenant',
                'Status',
                'Sessions',
                'Live',
                'Violations',
                'Flagged',
                'Awaiting review',
                'Success rate',
                'Storage',
                '',
              ]}
              isEmpty={Boolean(rows) && filtered.length === 0}
              empty={
                <EmptyState
                  icon="building"
                  title="No tenants match"
                  description="Try clearing search or status filter."
                />
              }
            >
              {!rows
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="ps-table-empty">
                        <Skeleton height={16} />
                      </td>
                    </tr>
                  ))
                : pager.pageItems.map((r) => (
                    <tr
                      key={r.tenant_id}
                      className="ps-row-link"
                      onClick={() => router.push(`/tenants/${r.tenant_id}`)}
                    >
                      <Td>
                        <div className="ps-cell-primary">{r.name}</div>
                        <div className="ps-cell-sub ps-mono">{r.slug}</div>
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>{formatCount(r.total_sessions)}</Td>
                      <Td>
                        {r.active_sessions ? (
                          <span className="ps-row" style={{ gap: 6 }}>
                            <strong>{formatCount(r.active_sessions)}</strong>
                          </span>
                        ) : (
                          <span className="ps-muted">0</span>
                        )}
                      </Td>
                      <Td>{formatCount(r.violation_flags_sum)}</Td>
                      <Td>{formatCount(r.flagged_sessions)}</Td>
                      <Td>{formatCount(r.awaiting_review)}</Td>
                      <Td>{successPct(r.success_rate)}</Td>
                      <Td nowrap>{formatBytes(r.storage_bytes)}</Td>
                      <Td nowrap>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/tenants/${r.tenant_id}`);
                          }}
                        >
                          Open
                        </Button>
                      </Td>
                    </tr>
                  ))}
            </DataTable>

            {rows && (
              <TablePagination
                page={pager.page}
                pageSize={pager.pageSize}
                total={pager.total}
                pageCount={pager.pageCount}
                onPageChange={pager.setPage}
                onPageSizeChange={pager.setPageSize}
              />
            )}
          </Card>
        </div>
      </SuperAdminShell>
    </AuthGuard>
  );
}
