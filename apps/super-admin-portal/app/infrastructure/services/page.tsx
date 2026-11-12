'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  PageHeader,
  Skeleton,
  StatCard,
  Td,
  Tabs,
} from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount } from '@/lib/format';
import { DynamicBarChart, ProbeDetailsPanel, toneForStatus } from '@/components/infra/charts';

const SERVICES = ['platform_api', 'websocket', 'postgres', 'redis', 'media', 'ai_sidecar', 'queue', 'admission'] as const;

function ServiceMonitoringInner() {
  const sp = useSearchParams();
  const initial = (sp.get('service') || 'platform_api') as string;
  const [service, setService] = useState(SERVICES.includes(initial as (typeof SERVICES)[number]) ? initial : 'platform_api');
  const [detail, setDetail] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setErr('');
    Promise.all([getClient().getInfrastructureServices(), getClient().getInfrastructureService(service)])
      .then(([all, one]) => {
        if (cancelled) return;
        setList((all.data as any[]) || []);
        setDetail(one.data);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    const t = setInterval(() => {
      getClient()
        .getInfrastructureService(service)
        .then((one) => setDetail(one.data))
        .catch(() => {});
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [service]);

  const live = detail?.live;
  const latencySeries = useMemo(() => {
    const rows = (detail?.series || []).filter(
      (s: any) => s.metric_name === 'request_duration' || s.metric_name === 'ai_tick' || s.metric_name === 'request_count'
    );
    if (!rows.length) return [];
    const r = rows[0];
    return (r.timestamps || []).map((t: number, i: number) => ({ t: new Date(t).toISOString(), v: r.points[i] }));
  }, [detail]);

  return (
    <>
      <PageHeader
        title="Service Monitoring"
        description="Per-service live status, latency and tenant attribution where available."
        actions={
          <Button icon="refresh" loading={busy} onClick={() => setService((s) => s)}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}

      <Tabs tabs={SERVICES.map((s) => ({ id: s, label: s.replace(/_/g, ' ') }))} value={service} onChange={setService} />

      <div className="ps-stats">
        {!live ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="ps-stat" key={i}>
              <Skeleton height={48} />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Status" value={<Badge tone={toneForStatus(live.status)} dot>{live.status}</Badge>} />
            <StatCard label="Latency" value={live.latency_ms != null ? `${live.latency_ms} ms` : '—'} />
            <StatCard label="Queue / depth" value={live.queue_depth != null ? formatCount(live.queue_depth) : '—'} />
            <StatCard label="Services online" value={`${list.filter((x) => x.status === 'healthy').length}/${list.length || 0}`} />
          </>
        )}
      </div>

      <div className="ps-grid-2">
        <Card
          title={service === 'platform_api' ? 'API latency trend' : 'Live metric trend'}
          description="Recent request samples — bar height is latency. Hover a bar for the exact value."
        >
          {busy && !detail ? (
            <Skeleton height={140} />
          ) : (
            <DynamicBarChart
              points={latencySeries}
              valueSuffix={service === 'platform_api' ? ' ms' : ''}
              emptyLabel="No live samples yet — traffic will fill this chart"
            />
          )}
        </Card>
        <Card title="Probe details" description="Readable metrics — not raw JSON.">
          <ProbeDetailsPanel details={live?.details || {}} />
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Tenant breakdown" description="Attribution class shown per row when available." flush>
          <DataTable
            headers={['Tenant', 'Metric', 'Attribution']}
            isEmpty={!detail?.tenant_breakdown?.length}
            empty="No tenant attribution for this service yet."
          >
            {(detail?.tenant_breakdown || []).map((row: any, i: number) => (
              <tr key={row.tenant_id || i}>
                <Td>{row.name || row.tenant_id || '—'}</Td>
                <Td>
                  {row.live_sessions != null && `${row.live_sessions} live `}
                  {row.connections != null && `${row.connections} connections `}
                  {row.storage_bytes != null && `storage ${formatBytes(row.storage_bytes)} `}
                  {row.lanes && JSON.stringify(row.lanes)}
                </Td>
                <Td muted>{row.attribution || '—'}</Td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </div>
    </>
  );
}

export default function ServiceMonitoringPage() {
  return (
    <Suspense fallback={<p className="ps-muted">Loading services…</p>}>
      <ServiceMonitoringInner />
    </Suspense>
  );
}
