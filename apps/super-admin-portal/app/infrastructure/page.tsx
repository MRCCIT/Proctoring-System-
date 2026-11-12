'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  PageHeader,
  Skeleton,
  StatCard,
} from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount, formatPercent, relativeTime } from '@/lib/format';
import { DynamicBarChart, toneForStatus } from '@/components/infra/charts';

type Overview = {
  checked_at: string;
  summary: Record<string, number | string | null>;
  hardware: Record<string, number | null | object>;
  services: { name: string; status: string; latency_ms?: number | null; queue_depth?: number | null; href?: string }[];
  series: {
    api_rpm: { t: string; v: number }[];
    sessions: { t: string; v: number }[];
    request_latency: { t: string; v: number }[];
  };
  top_tenants: {
    tenant_id: string;
    name: string;
    slug?: string;
    status?: string;
    live_sessions: number;
    storage_bytes: string;
  }[];
  policies: { load_level?: string; ai_degradation_level?: number; optimization_mode?: string };
};

function hwValue(v: unknown) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) {
    return <span className="ps-hw-unavailable">Unavailable</span>;
  }
  return formatPercent(v, 2);
}

const LOAD_COPY: Record<string, string> = {
  L0: 'Normal',
  L1: 'Elevated',
  L2: 'Busy',
  L3: 'Strained',
  L4: 'Critical',
};

function loadTone(level?: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (String(level || 'L0').toUpperCase()) {
    case 'L0':
      return 'success';
    case 'L1':
      return 'info';
    case 'L2':
      return 'warning';
    case 'L3':
    case 'L4':
      return 'danger';
    default:
      return 'neutral';
  }
}

function aiDegTone(level?: number): 'success' | 'info' | 'warning' | 'danger' {
  const n = Number(level ?? 0);
  if (n >= 3) return 'danger';
  if (n >= 2) return 'warning';
  if (n >= 1) return 'info';
  return 'success';
}

function OverviewStatusMeta({
  checkedAt,
  loadLevel,
  aiDeg,
}: {
  checkedAt: string;
  loadLevel?: string;
  aiDeg?: number;
}) {
  const level = String(loadLevel || 'L0').toUpperCase();
  const deg = Number(aiDeg ?? 0);
  return (
    <div className="ps-infra-status">
      <span className="ps-infra-status-updated">
        <Icon name="clock" size={13} />
        Updated {relativeTime(checkedAt)}
      </span>
      <Badge tone={loadTone(level)} dot>
        Load {level} · {LOAD_COPY[level] || 'Unknown'}
      </Badge>
      <Badge tone={aiDegTone(deg)} dot={deg > 0}>
        AI degrade {deg}/3{deg === 0 ? ' · full' : deg >= 3 ? ' · max' : ''}
      </Badge>
    </div>
  );
}

export default function InfrastructureOverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    setErr('');
    getClient()
      .getInfrastructureOverview()
      .then((r) => setData(r.data as Overview))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const s = data?.summary;
  const hw = data?.hardware || {};

  return (
    <>
      <PageHeader
        title="Infrastructure Command Center"
        description="Live platform health, service probes, hardware pressure and tenant hotspots."
        meta={
          data ? (
            <OverviewStatusMeta
              checkedAt={data.checked_at}
              loadLevel={data.policies?.load_level}
              aiDeg={data.policies?.ai_degradation_level}
            />
          ) : undefined
        }
        actions={
          <Button icon="refresh" loading={busy} onClick={load}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}

      <div className="ps-stats">
        {!s
          ? Array.from({ length: 8 }).map((_, i) => (
              <div className="ps-stat" key={i}>
                <Skeleton width={90} />
                <div style={{ height: 10 }} />
                <Skeleton height={28} width={60} />
              </div>
            ))
          : (
            <>
              <StatCard label="Total tenants" value={formatCount(s.total_tenants as number)} hint={`${formatCount(s.active_tenants as number)} active`} icon={<Icon name="building" />} tone="info" />
              <StatCard label="Live sessions" value={formatCount(s.live_sessions as number)} icon={<Icon name="live" />} tone={Number(s.live_sessions) ? 'success' : 'default'} />
              <StatCard label="API req/min" value={formatCount(s.api_requests_per_minute as number)} icon={<Icon name="activity" />} />
              <StatCard label="WebSockets" value={formatCount(s.websocket_connections as number)} icon={<Icon name="plug" />} />
              <StatCard label="Queue pending" value={formatCount(s.pending_queue_jobs as number)} icon={<Icon name="list" />} tone={Number(s.pending_queue_jobs) > 0 ? 'warning' : 'default'} />
              <StatCard label="Storage" value={formatBytes(s.total_storage_bytes as string)} hint={`${formatBytes(s.total_egress_bytes as string)} egress`} icon={<Icon name="server" />} />
              <StatCard label="Incidents" value={formatCount(s.open_incidents as number)} icon={<Icon name="alert" />} tone={Number(s.open_incidents) ? 'danger' : 'default'} />
              <StatCard label="Opt mode" value={String(data?.policies?.optimization_mode || 'OBSERVE')} icon={<Icon name="flag" />} />
            </>
          )}
      </div>

      <div className="ps-grid-2" style={{ marginTop: 8 }}>
        <Card title="Hardware" description="Local node sample. Missing sensors show Unavailable — never zero.">
          {!data ? (
            <Skeleton height={100} />
          ) : (
            <div className="ps-stats" style={{ marginBottom: 0 }}>
              <StatCard label="CPU" value={hwValue(hw.cpu_pct)} />
              <StatCard label="RAM" value={hwValue(hw.ram_pct)} />
              <StatCard label="GPU" value={hwValue(hw.gpu_util_pct)} />
              <StatCard label="GPU mem" value={hwValue(hw.gpu_memory_pct)} />
              <StatCard label="Disk" value={hwValue(hw.disk_pct)} />
              <StatCard
                label="Network"
                value={
                  hw.network_rx_bps == null ? (
                    <span className="ps-hw-unavailable">Unavailable</span>
                  ) : (
                    formatBytes(hw.network_rx_bps as number)
                  )
                }
              />
            </div>
          )}
        </Card>
        <Card title="API latency (live)" description="In-memory request duration samples (ms).">
          {!data ? (
            <Skeleton height={140} />
          ) : (
            <DynamicBarChart
              points={data.series.request_latency || []}
              colorClass="ps-bar-b"
              valueSuffix=" ms"
              emptyLabel="No latency samples yet"
            />
          )}
        </Card>
      </div>

      <div className="ps-grid-2" style={{ marginTop: 16 }}>
        <Card
          title="API requests (live window)"
          description="Requests per 10s — quiet stays low; yellow ≥15, red ≥50."
        >
          {!data ? (
            <Skeleton height={140} />
          ) : (
            <DynamicBarChart
              points={data.series.api_rpm || []}
              emptyLabel="No request samples yet"
              bucketMs={10_000}
              maxBars={24}
              tickCount={4}
              thresholds={{ warn: 15, critical: 50 }}
              legend
            />
          )}
        </Card>
        <Card title="Sessions started (30d)" description="Platform session volume.">
          {!data ? (
            <Skeleton height={120} />
          ) : (
            <DynamicBarChart
              points={(data.series.sessions || []).map((d) => ({
                t: String(d.t),
                v: d.v,
                label: new Date(d.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
              }))}
              maxBars={31}
              tickCount={5}
              height={160}
              emptyLabel="No session volume samples yet"
            />
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Service health" description="Live probes — click through to Service Monitoring.">
          {!data ? (
            <Skeleton height={120} />
          ) : (
            <div className="ps-service-grid">
              {(data.services || []).map((svc) => (
                <Link key={svc.name} href={`/infrastructure/services?service=${encodeURIComponent(svc.name)}`} className="ps-service-card">
                  <div className="ps-inline" style={{ justifyContent: 'space-between' }}>
                    <h3>{svc.name.replace(/_/g, ' ')}</h3>
                    <Badge tone={toneForStatus(svc.status)} dot>
                      {svc.status}
                    </Badge>
                  </div>
                  <div className="ps-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                    {svc.latency_ms != null ? `${svc.latency_ms} ms` : 'Latency —'}
                    {svc.queue_depth != null ? ` · depth ${svc.queue_depth}` : ''}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card
          title="Hot tenants"
          description="Ranked by live sessions — storage is recording media usage."
          actions={
            <Button size="sm" onClick={() => router.push('/infrastructure/tenants')}>
              View all
            </Button>
          }
        >
          {!data ? (
            <Skeleton height={160} />
          ) : !data.top_tenants?.length ? (
            <p className="ps-muted" style={{ margin: 0 }}>
              No tenant activity yet.
            </p>
          ) : (
            <div className="ps-hot-tenants">
              <div className="ps-hot-tenants-head" aria-hidden>
                <span />
                <span>Tenant</span>
                <span>Live</span>
                <span>Storage</span>
              </div>
              {(data.top_tenants || []).map((t, i) => (
                <Link
                  key={t.tenant_id}
                  href={`/infrastructure/tenants/${t.tenant_id}`}
                  className="ps-hot-tenant-row"
                >
                  <span className="ps-hot-rank">{i + 1}</span>
                  <span className="ps-hot-tenant-meta">
                    <strong className="ps-hot-tenant-name">{t.name}</strong>
                    <span className="ps-hot-tenant-sub">
                      {t.slug || t.tenant_id.slice(0, 8)}
                      {t.status ? ` · ${t.status}` : ''}
                    </span>
                  </span>
                  <span className="ps-hot-metric">
                    <strong>{formatCount(t.live_sessions)}</strong>
                    <span>sessions</span>
                  </span>
                  <span className="ps-hot-metric">
                    <strong>{formatBytes(t.storage_bytes)}</strong>
                    <span>media</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
