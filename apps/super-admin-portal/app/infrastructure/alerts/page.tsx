'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Td,
} from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toneForStatus } from '@/components/infra/charts';

export default function AlertsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('open');

  const load = () => {
    getClient()
      .getInfrastructureAlerts({ status: status || undefined, limit: '100' })
      .then((r) => setRows((r.data as any[]) || []))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [status]);

  const ack = async (id: string) => {
    await getClient().acknowledgeInfrastructureAlert(id);
    load();
  };
  const resolve = async (id: string) => {
    await getClient().resolveInfrastructureAlert(id);
    load();
  };

  return (
    <>
      <PageHeader
        title="Alerts & Incidents"
        description="Threshold breaches across services and tenants."
        actions={
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
            <Button icon="refresh" onClick={load}>
              Refresh
            </Button>
          </>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      <Card flush>
        <DataTable
          headers={['When', 'Severity', 'Title', 'Service', 'Tenant', 'Value', '']}
          isEmpty={Boolean(rows) && !rows?.length}
          empty={<EmptyState icon="alert" title="No alerts" description="Healthy — or evaluator has not fired yet." />}
        >
          {(rows || []).map((a) => (
            <tr key={a.id}>
              <Td muted nowrap>
                {formatDateTime(a.created_at)}
              </Td>
              <Td>
                <Badge tone={a.severity === 'critical' || a.severity === 'high' ? 'danger' : a.severity === 'medium' ? 'warning' : 'neutral'}>
                  {a.severity}
                </Badge>
              </Td>
              <Td>
                <div className="ps-cell-primary">{a.title}</div>
                <div className="ps-cell-sub">{a.message}</div>
              </Td>
              <Td>{a.service_name || '—'}</Td>
              <Td>{a.tenant_name || a.tenant_id || '—'}</Td>
              <Td>
                {a.trigger_value ?? '—'}
                {a.threshold_value != null ? ` / ${a.threshold_value}` : ''}
              </Td>
              <Td nowrap>
                {a.status === 'open' && (
                  <Button size="sm" onClick={() => ack(a.id)}>
                    Ack
                  </Button>
                )}{' '}
                {a.status !== 'resolved' && (
                  <Button size="sm" variant="primary" onClick={() => resolve(a.id)}>
                    Resolve
                  </Button>
                )}
                {a.status === 'resolved' && <Badge tone={toneForStatus('ok')}>resolved</Badge>}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
