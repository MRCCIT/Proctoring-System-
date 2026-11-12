'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, PageHeader, Td } from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatDateTime, humanizeCode } from '@/lib/format';

export default function InfraAuditPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = (cursor?: string) => {
    getClient()
      .getInfrastructureControlAudit({ cursor, limit: '50' })
      .then((r) => {
        setRows((prev) => (cursor && prev ? [...prev, ...(r.data as any[])] : (r.data as any[]) || []));
        setNext(r.next_cursor);
      })
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        title="Control Audit Logs"
        description="Manual and automatic infrastructure control changes."
        actions={
          <Button icon="refresh" onClick={() => load()}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      <Card flush>
        <DataTable
          headers={['When', 'Action', 'Scope', 'Actor', 'Source', 'Success']}
          isEmpty={Boolean(rows) && !rows?.length}
          empty={<EmptyState icon="list" title="No control events yet" />}
        >
          {(rows || []).map((l) => (
            <tr key={l.id}>
              <Td muted nowrap>
                {formatDateTime(l.created_at)}
              </Td>
              <Td>
                <div className="ps-cell-primary">{humanizeCode(l.action)}</div>
                <div className="ps-cell-sub ps-mono">{l.action}</div>
              </Td>
              <Td>
                {l.scope}
                {l.tenant_id ? ` · ${String(l.tenant_id).slice(0, 8)}` : ''}
              </Td>
              <Td muted>{l.actor_email || l.actor_id || '—'}</Td>
              <Td>{l.source}</Td>
              <Td>{l.success ? 'yes' : 'no'}</Td>
            </tr>
          ))}
        </DataTable>
        {next && (
          <div style={{ padding: 14 }}>
            <Button size="sm" onClick={() => load(next)}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
