'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  SearchInput,
  Skeleton,
  StatusBadge,
  TablePagination,
  Td,
  Toolbar,
  useClientPagination,
} from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount, pct } from '@/lib/format';

export default function InfraTenantsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    getClient()
      .getInfrastructureTenants()
      .then((r) => setRows((r.data as any[]) || []))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !needle || r.name?.toLowerCase().includes(needle) || r.slug?.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.live_sessions || 0) - Number(a.live_sessions || 0));
  }, [rows, q]);

  const pager = useClientPagination(filtered, 10);

  return (
    <>
      <PageHeader
        title="Tenant Analytics"
        description="Service-wise resource consumption across organizations."
        actions={
          <Button icon="refresh" onClick={load}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      <Card flush>
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search tenant" />
          <span className="ps-toolbar-spacer" />
          <span className="ps-muted" style={{ fontSize: 13 }}>
            {rows ? `${filtered.length} tenants` : 'Loading…'}
          </span>
        </Toolbar>
        <DataTable
          headers={['Tenant', 'Status', 'Live', 'Quota util', 'WS', 'Storage', 'Egress', 'Alerts', '']}
          isEmpty={Boolean(rows) && !filtered.length}
          empty={<EmptyState icon="building" title="No tenants" />}
        >
          {!rows
            ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9}>
                    <Skeleton height={16} />
                  </td>
                </tr>
              ))
            : pager.pageItems.map((r) => (
                <tr key={r.tenant_id} className="ps-row-link" onClick={() => router.push(`/infrastructure/tenants/${r.tenant_id}`)}>
                  <Td>
                    <div className="ps-cell-primary">{r.name}</div>
                    <div className="ps-cell-sub ps-mono">{r.slug}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>{formatCount(r.live_sessions)}</Td>
                  <Td>{pct(r.session_quota_util)}</Td>
                  <Td>{formatCount(r.websocket_connections)}</Td>
                  <Td nowrap>{formatBytes(r.storage_bytes)}</Td>
                  <Td nowrap>{formatBytes(r.egress_bytes)}</Td>
                  <Td>{formatCount(r.alerts)}</Td>
                  <Td>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/infrastructure/tenants/${r.tenant_id}`);
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
    </>
  );
}
