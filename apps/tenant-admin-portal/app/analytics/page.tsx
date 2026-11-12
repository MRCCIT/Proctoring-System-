'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Skeleton,
  StatCard,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';
import type { UsageAnalytics, ViolationsAnalytics } from '@/lib/analyticsTypes';
import { formatBytes, formatCount, formatDayShort, humanizeCode } from '@/lib/format';

type DayPoint = { day: string; sessions: number; events: number; serious: number };

function fillLastDays(days: number, sessions: UsageAnalytics['sessions_per_day'], events: ViolationsAnalytics['events_per_day']): DayPoint[] {
  const map = new Map<string, DayPoint>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { day: d.toISOString(), sessions: 0, events: 0, serious: 0 });
  }
  for (const s of sessions || []) {
    const key = new Date(s.day).toISOString().slice(0, 10);
    const row = map.get(key);
    if (row) row.sessions = s.sessions;
  }
  for (const e of events || []) {
    const key = new Date(e.day).toISOString().slice(0, 10);
    const row = map.get(key);
    if (row) {
      row.events = e.events;
      row.serious = e.serious;
    }
  }
  return [...map.values()];
}

function ActivityChart({ series }: { series: DayPoint[] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.sessions, d.events)));
  return (
    <>
      <div className="ps-bar-chart">
        {series.map((d, i) => {
          const showLabel = i % 3 === 0 || i === series.length - 1;
          return (
            <div
              className="ps-bar-col"
              key={d.day}
              title={`${formatDayShort(d.day)}: ${d.sessions} sessions, ${d.events} violations (${d.serious} serious)`}
            >
              <div className="ps-bar-stack" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                <div className="ps-bar ps-bar-a" style={{ height: `${(d.sessions / max) * 100}%` }} />
                <div className="ps-bar ps-bar-b" style={{ height: `${(d.events / max) * 100}%` }} />
              </div>
              <span className="ps-bar-label">{showLabel ? formatDayShort(d.day) : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="ps-legend" style={{ marginTop: 10 }}>
        <span>
          <i style={{ background: 'var(--ps-brand)' }} />
          Sessions
        </span>
        <span>
          <i style={{ background: '#f59e0b' }} />
          Violations
        </span>
      </div>
    </>
  );
}

function SeverityChart({ series }: { series: DayPoint[] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.events, d.serious)));
  return (
    <>
      <div className="ps-bar-chart">
        {series.map((d, i) => {
          const showLabel = i % 3 === 0 || i === series.length - 1;
          const other = Math.max(0, d.events - d.serious);
          return (
            <div className="ps-bar-col" key={d.day} title={`${formatDayShort(d.day)}: ${d.serious} serious / ${d.events} total`}>
              <div className="ps-bar-stack">
                {d.serious > 0 && <div className="ps-bar" style={{ height: `${(d.serious / max) * 100}%`, background: 'var(--ps-danger)' }} />}
                {other > 0 && <div className="ps-bar ps-bar-b" style={{ height: `${(other / max) * 100}%` }} />}
              </div>
              <span className="ps-bar-label">{showLabel ? formatDayShort(d.day) : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="ps-legend" style={{ marginTop: 10 }}>
        <span>
          <i style={{ background: 'var(--ps-danger)' }} />
          Serious
        </span>
        <span>
          <i style={{ background: '#f59e0b' }} />
          Other alerts
        </span>
      </div>
    </>
  );
}

export default function AnalyticsPage() {
  const [usage, setUsage] = useState<UsageAnalytics | null>(null);
  const [violations, setViolations] = useState<ViolationsAnalytics | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const c = getClient();
    Promise.all([c.getUsageAnalytics(), c.getViolationsAnalytics()])
      .then(([u, v]) => {
        setUsage(u.data as UsageAnalytics);
        setViolations(v.data as ViolationsAnalytics);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const series = useMemo(
    () => fillLastDays(30, usage?.sessions_per_day || [], violations?.events_per_day || []),
    [usage, violations],
  );

  const top = violations?.top_event_types || [];
  const topMax = Math.max(1, ...top.map((t) => t.count));
  const t = usage?.totals;
  const sessionSum = series.reduce((a, d) => a + d.sessions, 0);
  const eventSum = series.reduce((a, d) => a + d.events, 0);
  const seriousSum = series.reduce((a, d) => a + d.serious, 0);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Analytics"
          description="Usage and integrity signal trends for your organization over the last 30 days."
          actions={
            <>
              <Button href="/sessions" icon="sessions">
                Sessions
              </Button>
              <Button href="/reviews" variant="primary" icon="review">
                Review queue
              </Button>
            </>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!t ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div className="ps-stat" key={i}>
                <Skeleton width={90} />
                <div style={{ height: 10 }} />
                <Skeleton height={28} width={60} />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Sessions (30d)"
                value={formatCount(t.sessions_last_30d ?? sessionSum)}
                hint={`${formatCount(t.total_sessions)} all time`}
                icon={<Icon name="sessions" />}
              />
              <StatCard
                label="Live now"
                value={formatCount(t.active_sessions)}
                tone={t.active_sessions ? 'success' : 'default'}
                icon={<Icon name="live" />}
              />
              <StatCard
                label="Violations (30d)"
                value={formatCount(eventSum)}
                hint={`${formatCount(seriousSum)} serious`}
                tone={eventSum ? 'warning' : 'default'}
                icon={<Icon name="alert" />}
              />
              <StatCard
                label="Awaiting review"
                value={formatCount(t.awaiting_review || 0)}
                tone={t.awaiting_review ? 'warning' : 'default'}
                icon={<Icon name="review" />}
              />
              <StatCard label="Storage used" value={formatBytes(t.storage_bytes)} hint={`${formatBytes(t.bytes_egress)} egress`} icon={<Icon name="server" />} />
              <StatCard
                label="Candidates"
                value={formatCount(t.candidates)}
                hint={`${formatCount(t.exams)} exams`}
                icon={<Icon name="users" />}
              />
            </>
          )}
        </div>

        <div className="ps-grid ps-grid-main">
          <div>
            <Card title="Activity" description="Sessions started vs integrity alerts each day.">
              {!usage || !violations ? <Skeleton height={180} /> : <ActivityChart series={series} />}
            </Card>
            <Card title="Alert severity" description="Serious flags stacked above lower-severity alerts.">
              {!violations ? (
                <Skeleton height={180} />
              ) : eventSum === 0 ? (
                <EmptyState icon="check" title="No alerts in the last 30 days" description="When detections fire, severity trends appear here." />
              ) : (
                <SeverityChart series={series} />
              )}
            </Card>
          </div>
          <div>
            <Card title="Review outcomes" description="Human decisions recorded on completed sessions.">
              {!t ? (
                <Skeleton height={80} />
              ) : (
                <div className="ps-stats" style={{ marginBottom: 0 }}>
                  <StatCard label="Flagged" value={formatCount(t.flagged_sessions || 0)} tone={t.flagged_sessions ? 'danger' : 'default'} icon={<Icon name="flag" />} />
                  <StatCard label="Cleared" value={formatCount(t.cleared_sessions || 0)} tone="success" icon={<Icon name="check" />} />
                  <StatCard label="Pending" value={formatCount(t.awaiting_review || 0)} tone={t.awaiting_review ? 'warning' : 'default'} icon={<Icon name="clock" />} />
                </div>
              )}
            </Card>
            <Card title="Top signals" description="Most frequent integrity detections (90 days), info events excluded.">
              {!violations ? (
                <Skeleton height={140} />
              ) : top.length === 0 ? (
                <EmptyState icon="chart" title="No signals yet" description="AI and browser detections will roll up here once sessions run." />
              ) : (
                <div className="ps-stack">
                  {top.map((v) => (
                    <div key={v.code || v.event_type}>
                      <div className="ps-between" style={{ marginBottom: 4 }}>
                        <span>
                          {v.label || humanizeCode(v.code || v.event_type)}
                          {v.severity ? <span className="ps-muted"> · {v.severity}</span> : null}
                        </span>
                        <strong>{formatCount(v.count)}</strong>
                      </div>
                      <div className="ps-meter">
                        <span style={{ width: `${(v.count / topMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="At a glance">
              {!t ? (
                <Skeleton height={80} />
              ) : (
                <dl className="ps-kv">
                  <div>
                    <dt>Sessions (7 days)</dt>
                    <dd>{formatCount(t.sessions_last_7d ?? '—')}</dd>
                  </div>
                  <div>
                    <dt>Total violation flags</dt>
                    <dd>{formatCount(t.violation_flags)}</dd>
                  </div>
                  <div>
                    <dt>Storage</dt>
                    <dd>{formatBytes(t.storage_bytes)}</dd>
                  </div>
                  <div>
                    <dt>Egress</dt>
                    <dd>{formatBytes(t.bytes_egress)}</dd>
                  </div>
                </dl>
              )}
            </Card>
          </div>
        </div>
      </TenantAdminShell>
    </AuthGuard>
  );
}
