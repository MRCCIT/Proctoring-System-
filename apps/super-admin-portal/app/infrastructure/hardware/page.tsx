'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, DataTable, PageHeader, Skeleton, StatCard, Td } from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatBytes, formatPercent, relativeTime } from '@/lib/format';

export default function HardwarePage() {
  const [nodes, setNodes] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  const load = () => {
    getClient()
      .getInfrastructureHardware()
      .then((r) => setNodes(((r.data as any)?.nodes as any[]) || []))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const n = nodes?.[0];

  return (
    <>
      <PageHeader
        title="Hardware Monitoring"
        description="Node CPU, RAM, disk and optional NVIDIA GPU. Unavailable sensors are labeled — never shown as zero."
        actions={
          <Button icon="refresh" onClick={load}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      {!nodes ? (
        <Skeleton height={180} />
      ) : (
        <>
          <div className="ps-stats">
            <StatCard
              label="CPU"
              value={n?.cpu_pct != null ? formatPercent(n.cpu_pct) : <span className="ps-hw-unavailable">Unavailable</span>}
            />
            <StatCard
              label="RAM"
              value={n?.ram_pct != null ? formatPercent(n.ram_pct) : <span className="ps-hw-unavailable">Unavailable</span>}
              hint={
                n?.ram_used_bytes != null
                  ? `${formatBytes(n.ram_used_bytes)} / ${formatBytes(n.ram_total_bytes)}`
                  : undefined
              }
            />
            <StatCard
              label="Disk"
              value={n?.disk_pct != null ? formatPercent(n.disk_pct) : <span className="ps-hw-unavailable">Unavailable</span>}
              hint={
                n?.disk_used_bytes != null
                  ? `${formatBytes(n.disk_used_bytes)} / ${formatBytes(n.disk_total_bytes)}`
                  : undefined
              }
            />
            <StatCard
              label="GPU"
              value={
                Array.isArray(n?.gpu) && n.gpu[0]?.utilization_pct != null ? (
                  formatPercent(n.gpu[0].utilization_pct)
                ) : (
                  <span className="ps-hw-unavailable">Unavailable</span>
                )
              }
            />
          </div>
          <Card title="Nodes" flush>
            <DataTable headers={['Node', 'Role', 'CPU', 'RAM', 'Disk', 'GPU', 'Seen']}>
              {nodes.map((node) => (
                <tr key={node.id || node.hostname}>
                  <Td>
                    <div className="ps-cell-primary">{node.hostname || node.id}</div>
                    <div className="ps-cell-sub ps-mono">{node.id}</div>
                  </Td>
                  <Td>{node.role || '—'}</Td>
                  <Td>{node.cpu_pct != null ? formatPercent(node.cpu_pct) : '—'}</Td>
                  <Td>
                    {node.ram_pct != null ? formatPercent(node.ram_pct) : '—'}
                    {node.ram_used_bytes != null ? (
                      <div className="ps-cell-sub">
                        {formatBytes(node.ram_used_bytes)} / {formatBytes(node.ram_total_bytes)}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    {node.disk_pct != null ? formatPercent(node.disk_pct) : '—'}
                    {node.disk_used_bytes != null ? (
                      <div className="ps-cell-sub">
                        {formatBytes(node.disk_used_bytes)} / {formatBytes(node.disk_total_bytes)}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    {Array.isArray(node.gpu) && node.gpu[0]
                      ? `${node.gpu[0].name || 'GPU'} · ${formatPercent(node.gpu[0].utilization_pct)}`
                      : 'Unavailable'}
                  </Td>
                  <Td muted>{relativeTime(node.last_seen_at)}</Td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </>
      )}
    </>
  );
}
