'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Icon, PageHeader, Skeleton, StatCard } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount, formatDayShort, toLocalDayKey } from '@/lib/format';
import { DynamicBarChart } from '@/components/infra/charts';

type PlatformAnalytics = {
  summary: {
    active_tenants: number;
    total_tenants: number;
    active_sessions: number;
    total_sessions: number;
    total_storage_bytes: string;
    total_egress_bytes: string;
    total_violation_flags: string;
  };
  sessions_per_day: { day: string; sessions_started: number }[];
};

function fillDays(days: number, series: { day: string; sessions_started: number }[]) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const byDay = new Map<string, number>();
  for (const s of series || []) {
    const key = toLocalDayKey(s.day);
    if (key) byDay.set(key, Number(s.sessions_started) || 0);
  }
  const out: { day: string; sessions_started: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toLocalDayKey(d);
    out.push({ day: key, sessions_started: byDay.get(key) || 0 });
  }
  return out;
}

function DailyChart({ daily }: { daily: PlatformAnalytics['sessions_per_day'] }) {
  const filled = fillDays(30, daily || []);
  return (
    <DynamicBarChart
      points={filled.map((d) => ({
        t: `${d.day}T12:00:00`,
        v: d.sessions_started,
        label: formatDayShort(d.day),
      }))}
      maxBars={31}
      tickCount={5}
      height={160}
      emptyLabel="No sessions in the last 30 days"
    />
  );
}

export default function DashboardPage() {
  const [platform, setPlatform] = useState<PlatformAnalytics | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    getClient()
      .getPlatformAnalytics()
      .then((r) => setPlatform(r.data as PlatformAnalytics))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, []);

  const s = platform?.summary;
  const volume30 = useMemo(
    () => (platform?.sessions_per_day || []).reduce((n, d) => n + Number(d.sessions_started || 0), 0),
    [platform]
  );

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title="Platform overview"
          description="Fleet-wide proctoring activity across all tenant organizations."
          actions={
            <>
              <Button icon="refresh" loading={busy} onClick={load}>
                Refresh
              </Button>
              <Button href="/sessions" icon="live">
                Active sessions
              </Button>
              <Button href="/tenants/new" variant="primary" icon="plus">
                Create tenant
              </Button>
            </>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!s ? (
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
                label="Active tenants"
                value={formatCount(s.active_tenants)}
                hint={`${formatCount(s.total_tenants)} total`}
                icon={<Icon name="building" />}
                tone="info"
              />
              <StatCard
                label="Live sessions"
                value={formatCount(s.active_sessions)}
                hint="Across all tenants"
                icon={<Icon name="live" />}
                tone={s.active_sessions ? 'success' : 'default'}
              />
              <StatCard
                label="Sessions all time"
                value={formatCount(s.total_sessions)}
                hint={`${formatCount(volume30)} in last 30d`}
                icon={<Icon name="sessions" />}
              />
              <StatCard
                label="Storage used"
                value={formatBytes(s.total_storage_bytes)}
                hint={`${formatBytes(s.total_egress_bytes)} egress`}
                icon={<Icon name="server" />}
              />
              <StatCard
                label="Violation flags"
                value={formatCount(s.total_violation_flags)}
                icon={<Icon name="alert" />}
                tone={Number(s.total_violation_flags) > 0 ? 'warning' : 'default'}
              />
            </>
          )}
        </div>

        <div className="ps-grid-2" style={{ marginTop: 4 }}>
          <Card
            title="Sessions started (30 days)"
            description="Daily volume — empty days stay blank; hover a bar for the exact count."
          >
            {!platform ? <Skeleton height={140} /> : <DailyChart daily={platform.sessions_per_day || []} />}
          </Card>
          <Card title="Quick links" description="Jump to common platform operations.">
            <div className="ps-quick-links">
              {[
                {
                  href: '/tenants',
                  icon: 'building',
                  title: 'Manage tenants',
                  hint: 'Provision, suspend, rotate keys',
                },
                {
                  href: '/sessions',
                  icon: 'live',
                  title: 'Inspect live sessions',
                  hint: 'Cross-tenant monitoring',
                },
                {
                  href: '/analytics',
                  icon: 'chart',
                  title: 'Compare tenants',
                  hint: 'Usage and success rates',
                },
                {
                  href: '/infrastructure',
                  icon: 'server',
                  title: 'Infrastructure health',
                  hint: 'Live probes and snapshots',
                },
                {
                  href: '/audit-logs',
                  icon: 'list',
                  title: 'Audit trail',
                  hint: 'Operator and tenant actions',
                },
              ].map((item) => (
                <Link key={item.href} href={item.href} className="ps-quick-link">
                  <span className="ps-quick-link-icon" aria-hidden>
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span className="ps-quick-link-text">
                    <strong>{item.title}</strong>
                    <span>{item.hint}</span>
                  </span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </SuperAdminShell>
    </AuthGuard>
  );
}
