'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  DataTable,
  EmptyState,
  Icon,
  KeyValue,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
  Td,
} from '@proctorshield/ui-components';
import type { TenantSummary } from '@proctorshield/shared-types';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import {
  formatBytes,
  formatCount,
  formatDateTime,
  formatDayShort,
  humanizeCode,
  pct,
  toLocalDayKey,
} from '@/lib/format';
import { DynamicBarChart } from '@/components/infra/charts';

type TenantDetail = TenantSummary & {
  contact_name?: string | null;
  integration_status?: string | null;
  sdk_version?: string | null;
  feature_flags?: Record<string, unknown>;
  quotas?: { max_concurrent_sessions?: number; storage_mb?: number };
};

type TenantAnalytics = Awaited<ReturnType<ReturnType<typeof getClient>['getTenantAnalyticsSa']>>['data'];

type TenantUser = {
  id: string;
  email: string;
  display_name?: string | null;
  role: string;
  status?: string;
  created_at?: string;
};

const AI_POLICY_FLAGS: { key: string; label: string; hint: string }[] = [
  { key: 'ai_face_detection', label: 'Face detection', hint: 'Presence / absence of candidate face' },
  { key: 'multiple_faces', label: 'Multiple faces', hint: 'Flag extra people in frame' },
  { key: 'gaze_detection', label: 'Gaze tracking', hint: 'Looking away / attention' },
  { key: 'phone_detection', label: 'Phone detection', hint: 'Mobile device in view' },
  { key: 'object_detection', label: 'Object detection', hint: 'Books, notes, secondary screens' },
  { key: 'ai_audio_analysis', label: 'Audio analysis', hint: 'Voice / noise monitoring' },
  { key: 'network_monitoring', label: 'Network monitoring', hint: 'Connectivity / tab signals' },
];

function fillSessionDays(days: number, series: { day: string; sessions: number }[]) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const byDay = new Map<string, number>();
  for (const s of series || []) {
    const key = toLocalDayKey(s.day);
    if (key) byDay.set(key, Number(s.sessions) || 0);
  }
  const out: { day: string; sessions: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toLocalDayKey(d);
    out.push({ day: key, sessions: byDay.get(key) || 0 });
  }
  return out;
}

function SessionsChart({ series }: { series: { day: string; sessions: number }[] }) {
  const filled = fillSessionDays(30, series);
  return (
    <DynamicBarChart
      points={filled.map((d) => ({
        t: `${d.day}T12:00:00`,
        v: d.sessions,
        label: formatDayShort(d.day),
      }))}
      maxBars={31}
      tickCount={5}
      height={160}
      emptyLabel="No sessions in the last 30 days"
    />
  );
}

function ViolationsChart({
  series,
}: {
  series: { day: string; events: number; serious: number }[];
}) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const byDay = new Map<string, { events: number; serious: number }>();
  for (const s of series || []) {
    const key = toLocalDayKey(s.day);
    if (key) byDay.set(key, { events: Number(s.events) || 0, serious: Number(s.serious) || 0 });
  }
  const filled: { day: string; events: number; serious: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toLocalDayKey(d);
    const row = byDay.get(key) || { events: 0, serious: 0 };
    filled.push({ day: key, ...row });
  }
  const max = Math.max(1, ...filled.map((d) => Math.max(d.events, d.serious)));
  const tickIdx = [0, Math.floor((filled.length - 1) / 2), filled.length - 1];
  return (
    <>
      <div className="ps-chart" style={{ ['--ps-chart-h' as string]: '160px' }}>
        <div className="ps-chart-y" aria-hidden>
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="ps-chart-plot">
          <div className="ps-chart-bars" role="img" aria-label="Violations trend">
            {filled.map((d) => {
              const other = Math.max(0, d.events - d.serious);
              const tip = `${formatDayShort(d.day)}: ${d.serious} serious / ${d.events} total`;
              return (
                <div className="ps-chart-bar-slot ps-chart-bar-stack" key={d.day} title={tip}>
                  {d.serious > 0 && (
                    <div
                      className="ps-chart-bar"
                      style={{
                        height: `${Math.max(4, (d.serious / max) * 100)}%`,
                        background: 'var(--ps-danger)',
                      }}
                    />
                  )}
                  {other > 0 && (
                    <div
                      className="ps-chart-bar"
                      style={{
                        height: `${Math.max(4, (other / max) * 100)}%`,
                        background: '#f59e0b',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="ps-chart-x">
            {tickIdx.map((i) => (
              <span key={filled[i].day}>{formatDayShort(filled[i].day)}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="ps-legend" style={{ marginTop: 10 }}>
        <span>
          <i style={{ background: 'var(--ps-danger)' }} />
          Serious
        </span>
        <span>
          <i style={{ background: '#f59e0b' }} />
          Other
        </span>
      </div>
    </>
  );
}

function QuotaMeter({ label, used, limit, format }: { label: string; used: number; limit: number; format: (n: number) => string }) {
  const pctUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pctUsed >= 90 ? 'danger' : pctUsed >= 70 ? 'warning' : 'default';
  return (
    <div className={`ps-stat ps-tone-${tone}`}>
      <div className="ps-stat-top">
        <span className="ps-stat-label">{label}</span>
        <span className="ps-stat-hint">{pctUsed}%</span>
      </div>
      <div className="ps-stat-value" style={{ fontSize: 18 }}>
        {format(used)} <span className="ps-muted" style={{ fontSize: 13, fontWeight: 500 }}>/ {format(limit)}</span>
      </div>
      <div className="ps-meter" style={{ marginTop: 10 }}>
        <span style={{ width: `${pctUsed}%` }} />
      </div>
    </div>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [analytics, setAnalytics] = useState<TenantAnalytics | null>(null);
  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  const [flagDraft, setFlagDraft] = useState<Record<string, boolean> | null>(null);

  const load = useCallback(async () => {
    const client = getClient();
    const [t, a, u] = await Promise.all([
      client.getTenant(id),
      client.getTenantAnalyticsSa(id),
      client.listTenantUsersSa(id).catch(() => ({ data: [] as TenantUser[] })),
    ]);
    const detail = t.data as TenantDetail;
    setTenant(detail);
    setAnalytics(a.data);
    setUsers((u.data || []) as TenantUser[]);
    const flags = detail.feature_flags || {};
    setFlagDraft(
      Object.fromEntries(
        AI_POLICY_FLAGS.map((f) => [f.key, Boolean(flags[f.key] ?? false)])
      )
    );
  }, [id]);

  useEffect(() => {
    load().catch((e) => setErr((e as Error).message));
  }, [load]);

  const totals = analytics?.usage?.totals;
  const quotas = tenant?.quotas || {};
  const storageQuotaBytes = Number(quotas.storage_mb || 0) * 1024 * 1024;
  const maxConcurrent = Number(quotas.max_concurrent_sessions || 0);

  const topViolations = useMemo(() => analytics?.violations?.top_event_types || [], [analytics]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setErr('');
    setToast('');
    try {
      await fn();
      setToast(`${label} done`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title={tenant?.name || 'Tenant detail'}
          description={tenant ? `${tenant.slug} · provisioned ${formatDateTime(tenant.created_at)}` : 'Loading organization…'}
          breadcrumbs={[{ href: '/tenants', label: 'Tenants' }, { label: tenant?.name || 'Detail' }]}
          meta={
            tenant ? (
              <span className="ps-row" style={{ gap: 8 }}>
                <StatusBadge status={tenant.status} />
                {tenant.integration_status && <Badge tone="brand">{tenant.integration_status}</Badge>}
                {tenant.api_key_prefix && (
                  <Badge>
                    Key {tenant.api_key_prefix}…
                  </Badge>
                )}
              </span>
            ) : undefined
          }
          actions={
            <>
              <Button
                variant="primary"
                icon="external"
                loading={busy === 'Open portal'}
                disabled={!tenant || tenant.status === 'suspended'}
                onClick={() =>
                  void run('Open portal', async () => {
                    const r = await getClient().impersonateTenant(id);
                    window.open(r.data.handoff_url, '_blank', 'noopener,noreferrer');
                  })
                }
              >
                Open tenant portal
              </Button>
              <Button href="/analytics" icon="chart">
                Compare tenants
              </Button>
              <Button
                icon="refresh"
                loading={busy === 'Refresh'}
                onClick={() => void run('Refresh', load)}
              >
                Refresh
              </Button>
              {tenant?.status === 'active' ? (
                <Button
                  variant="danger"
                  loading={busy === 'Suspend'}
                  onClick={() =>
                    void run('Suspend', async () => {
                      await getClient().suspendTenant(id);
                      await load();
                    })
                  }
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="success"
                  loading={busy === 'Activate'}
                  onClick={() =>
                    void run('Activate', async () => {
                      await getClient().activateTenant(id);
                      await load();
                    })
                  }
                >
                  Activate
                </Button>
              )}
              <Button
                variant="primary"
                icon="key"
                loading={busy === 'Rotate key'}
                onClick={() =>
                  void run('Rotate key', async () => {
                    const r = await getClient().rotateTenantKey(id);
                    setApiKey(r.api_key);
                    setTenant(r.data as TenantDetail);
                  })
                }
              >
                Rotate API key
              </Button>
            </>
          }
        />

        {err && <Alert tone="danger">{err}</Alert>}
        {toast && <Alert tone="success">{toast}</Alert>}
        {apiKey && (
          <Alert tone="warning" title="New API key — copy now, it will not be shown again">
            <div className="ps-secret">
              <span>{apiKey}</span>
              <CopyButton value={apiKey} />
            </div>
          </Alert>
        )}

        {tenant?.status === 'active' ? (
          <Card
            title="Tenant admin console"
            description="Open this organization’s admin portal as a platform super admin (audited, short-lived session)."
            style={{ marginBottom: 16 }}
            actions={
              <Button
                variant="primary"
                icon="external"
                loading={busy === 'Open portal'}
                onClick={() =>
                  void run('Open portal', async () => {
                    const r = await getClient().impersonateTenant(id);
                    window.open(r.data.handoff_url, '_blank', 'noopener,noreferrer');
                  })
                }
              >
                Open tenant portal
              </Button>
            }
          />
        ) : null}

        <div className="ps-stats">
          {!totals ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div className="ps-stat" key={i}>
                <Skeleton width={90} />
                <div style={{ height: 10 }} />
                <Skeleton height={28} width={60} />
              </div>
            ))
          ) : (
            <>
              <StatCard label="Exams" value={formatCount(totals.exams)} icon={<Icon name="exam" />} />
              <StatCard label="Candidates" value={formatCount(totals.candidates)} icon={<Icon name="users" />} />
              <StatCard
                label="Live sessions"
                value={formatCount(totals.active_sessions)}
                hint={`${formatCount(totals.total_sessions)} all time`}
                icon={<Icon name="live" />}
                tone={totals.active_sessions ? 'success' : 'default'}
              />
              <StatCard
                label="Last 30 days"
                value={formatCount(totals.sessions_last_30d)}
                hint={`${formatCount(totals.sessions_last_7d)} in 7d`}
                icon={<Icon name="sessions" />}
              />
              <StatCard
                label="Violation flags"
                value={formatCount(totals.violation_flags)}
                icon={<Icon name="alert" />}
                tone={Number(totals.violation_flags) > 0 ? 'warning' : 'default'}
              />
              <StatCard
                label="Awaiting review"
                value={formatCount(totals.awaiting_review)}
                hint={`${formatCount(totals.flagged_sessions)} flagged · ${formatCount(totals.cleared_sessions)} cleared`}
                icon={<Icon name="review" />}
                tone={totals.awaiting_review ? 'warning' : 'default'}
              />
            </>
          )}
        </div>

        <div className="ps-grid-2" style={{ marginTop: 16 }}>
          <QuotaMeter
            label="Concurrent capacity"
            used={Number(totals?.active_sessions || 0)}
            limit={maxConcurrent || 1}
            format={(n) => formatCount(n)}
          />
          <QuotaMeter
            label="Storage quota"
            used={Number(totals?.storage_bytes || tenant?.usage?.storage_bytes_used || 0)}
            limit={storageQuotaBytes || 1}
            format={(n) => formatBytes(n)}
          />
        </div>

        <div className="ps-grid-2" style={{ marginTop: 20 }}>
          <Card title="Sessions (30 days)" description="Daily session starts for this organization.">
            {!analytics ? <Skeleton height={160} /> : <SessionsChart series={analytics.usage.sessions_per_day || []} />}
          </Card>
          <Card title="Violations (30 days)" description="Serious vs other integrity events over time.">
            {!analytics ? (
              <Skeleton height={160} />
            ) : (
              <ViolationsChart series={analytics.violations.events_per_day || []} />
            )}
          </Card>
        </div>

        <div className="ps-grid-2" style={{ marginTop: 20 }}>
          <Card title="Top violation types" description="Last 90 days, rolled up by catalog code.">
            {!analytics ? (
              <Skeleton height={120} />
            ) : topViolations.length === 0 ? (
              <EmptyState icon="check" title="Clean slate" description="No violation events recorded for this tenant yet." />
            ) : (
              <DataTable headers={['Type', 'Category', 'Severity', 'Count']}>
                {topViolations.map((v) => (
                  <tr key={v.code}>
                    <Td>
                      <div className="ps-cell-primary">{v.label || humanizeCode(v.code)}</div>
                      <div className="ps-cell-sub ps-mono">{v.code}</div>
                    </Td>
                    <Td muted>{v.category || '—'}</Td>
                    <Td>
                      <Badge tone={v.severity === 'critical' || v.severity === 'flag' ? 'danger' : 'warning'}>
                        {String(v.severity || 'info').toUpperCase()}
                      </Badge>
                    </Td>
                    <Td>{formatCount(v.count)}</Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          <Card title="Organization profile" description="Contacts, integration and success rate.">
            {!tenant ? (
              <Skeleton height={160} />
            ) : (
              <KeyValue
                items={[
                  { label: 'Status', value: <StatusBadge status={tenant.status} /> },
                  { label: 'Slug', value: <span className="ps-mono">{tenant.slug}</span> },
                  { label: 'Contact', value: tenant.contact_email || '—' },
                  { label: 'Contact name', value: tenant.contact_name || '—' },
                  { label: 'Integration', value: tenant.integration_status || '—' },
                  { label: 'SDK version', value: tenant.sdk_version || '—' },
                  { label: 'API key prefix', value: <span className="ps-mono">{tenant.api_key_prefix}</span> },
                  {
                    label: 'Session success',
                    value: pct(tenant.usage?.session_success_rate),
                  },
                  { label: 'Egress', value: formatBytes(totals?.bytes_egress || tenant.usage?.bytes_egress_total) },
                  { label: 'Updated', value: formatDateTime(tenant.updated_at) },
                ]}
              />
            )}
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card
            title="AI policies allowed"
            description="Turn modules on/off for this organization. Tenant admins still attach exam policies within these limits."
          >
            {!tenant || !flagDraft ? (
              <Skeleton height={120} />
            ) : (
              <>
                <div className="ps-policy-flag-grid">
                  {AI_POLICY_FLAGS.map((f) => (
                    <label key={f.key} className={`ps-policy-flag${flagDraft[f.key] ? ' is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(flagDraft[f.key])}
                        onChange={(e) =>
                          setFlagDraft((p) => ({ ...(p || {}), [f.key]: e.target.checked }))
                        }
                      />
                      <span>
                        <strong>{f.label}</strong>
                        <small>{f.hint}</small>
                      </span>
                      <Badge tone={flagDraft[f.key] ? 'success' : 'neutral'}>
                        {flagDraft[f.key] ? 'On' : 'Off'}
                      </Badge>
                    </label>
                  ))}
                </div>
                <div className="ps-inline" style={{ marginTop: 14 }}>
                  <Button
                    variant="primary"
                    loading={busy === 'Save flags'}
                    onClick={() =>
                      void run('Save flags', async () => {
                        const r = await getClient().updateTenant(id, { feature_flags: flagDraft });
                        setTenant(r.data as TenantDetail);
                      })
                    }
                  >
                    Save AI policies
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Organization users" description="Admins and proctors who can sign in to the tenant console.">
            <DataTable
              headers={['Name', 'Email', 'Role', 'Status', 'Added']}
              isEmpty={Boolean(users) && (users?.length || 0) === 0}
              empty={<EmptyState icon="users" title="No users yet" description="Invite an admin when provisioning this tenant." />}
            >
              {!users
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="ps-table-empty">
                        <Skeleton height={14} />
                      </td>
                    </tr>
                  ))
                : users.map((u) => (
                    <tr key={u.id}>
                      <Td>{u.display_name || '—'}</Td>
                      <Td>{u.email}</Td>
                      <Td>
                        <StatusBadge status={u.role} label={u.role.replace(/_/g, ' ')} />
                      </Td>
                      <Td muted>{u.status || '—'}</Td>
                      <Td muted nowrap>
                        {formatDateTime(u.created_at)}
                      </Td>
                    </tr>
                  ))}
            </DataTable>
          </Card>
        </div>
      </SuperAdminShell>
    </AuthGuard>
  );
}
