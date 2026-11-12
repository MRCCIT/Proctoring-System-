'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Skeleton,
  StatCard,
  TablePagination,
  Td,
  Toolbar,
  useClientPagination,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import { formatCount, formatDateTime, humanizeCode, relativeTime } from '@/lib/format';

type AuditRow = {
  id: string | number;
  action: string;
  actor_type?: string;
  actor_id?: string;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: unknown;
  created_at?: string;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (cursor?: string) => {
    setBusy(true);
    setErr('');
    getClient()
      .listAuditLogs({
        cursor,
        tenant_id: tenantId.trim() || undefined,
        action: action.trim() || undefined,
      })
      .then((r) => {
        const rows = r.data as AuditRow[];
        setLogs((prev) => (cursor && prev ? [...prev, ...rows] : rows));
        setNext(r.next_cursor);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, []);

  const pager = useClientPagination(logs || [], 15);

  const summary = useMemo(() => {
    const list = logs || [];
    const actors = new Set(list.map((l) => l.actor_type).filter(Boolean));
    const tenants = new Set(list.map((l) => l.tenant_id).filter(Boolean));
    return {
      events: list.length,
      actors: actors.size,
      tenants: tenants.size,
      latest: list[0]?.created_at,
    };
  }, [logs]);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title="Audit logs"
          description="Operator and system actions across the platform — provisioning, suspensions, and key rotations."
          actions={
            <Button icon="refresh" loading={busy} onClick={() => load()}>
              Refresh
            </Button>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!logs ? (
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
                label="Loaded events"
                value={formatCount(summary.events)}
                hint={next ? 'More available on server' : 'End of loaded window'}
                icon={<Icon name="list" />}
                tone="info"
              />
              <StatCard
                label="Actor types"
                value={formatCount(summary.actors)}
                icon={<Icon name="users" />}
              />
              <StatCard
                label="Tenants touched"
                value={formatCount(summary.tenants)}
                icon={<Icon name="building" />}
              />
              <StatCard
                label="Latest event"
                value={summary.latest ? relativeTime(summary.latest) : '—'}
                hint={summary.latest ? formatDateTime(summary.latest) : undefined}
                icon={<Icon name="clock" />}
              />
            </>
          )}
        </div>

        <Card flush>
          <Toolbar>
            <Field label="Tenant ID">
              <input
                className="ps-mono"
                placeholder="UUID (optional)"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            </Field>
            <Field label="Action contains">
              <input
                placeholder="e.g. tenant.created"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') load();
                }}
              />
            </Field>
            <Button variant="primary" loading={busy} onClick={() => load()}>
              Apply filters
            </Button>
            {(tenantId || action) && (
              <Button
                onClick={() => {
                  setTenantId('');
                  setAction('');
                  setBusy(true);
                  setErr('');
                  getClient()
                    .listAuditLogs({})
                    .then((r) => {
                      setLogs(r.data as AuditRow[]);
                      setNext(r.next_cursor);
                    })
                    .catch((e) => setErr((e as Error).message))
                    .finally(() => setBusy(false));
                }}
              >
                Clear
              </Button>
            )}
          </Toolbar>

          {!logs && !err ? (
            <div style={{ padding: 24 }}>
              <Skeleton height={180} />
            </div>
          ) : (
            <DataTable
              headers={['When', 'Action', 'Actor', 'Tenant', 'Resource']}
              isEmpty={!logs?.length}
              empty={
                <EmptyState
                  icon="list"
                  title="No audit events"
                  description="Actions appear here as operators manage the platform."
                />
              }
            >
              {pager.pageItems.map((l) => (
                <tr key={String(l.id)}>
                  <Td muted nowrap>
                    <div>{formatDateTime(l.created_at)}</div>
                    <div className="ps-cell-sub">{relativeTime(l.created_at)}</div>
                  </Td>
                  <Td>
                    <div className="ps-cell-primary">{humanizeCode(l.action)}</div>
                    <div className="ps-cell-sub ps-mono">{l.action}</div>
                  </Td>
                  <Td muted>
                    {l.actor_type || '—'}
                    {l.actor_id ? ` · ${String(l.actor_id).slice(0, 8)}` : ''}
                  </Td>
                  <Td mono muted>
                    {l.tenant_slug || (l.tenant_id ? String(l.tenant_id).slice(0, 8) : '—')}
                  </Td>
                  <Td muted>
                    {l.resource_type || '—'}
                    {l.resource_id ? ` · ${String(l.resource_id).slice(0, 8)}` : ''}
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}

          {logs && (
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
                  <Button size="sm" loading={busy} onClick={() => load(next)}>
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
