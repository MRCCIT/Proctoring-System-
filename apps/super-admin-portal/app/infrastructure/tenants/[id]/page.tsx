'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
} from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount } from '@/lib/format';
import { UtilizationMeter } from '@/components/infra/charts';

export default function InfraTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'overview' | 'services' | 'ai' | 'queue' | 'storage' | 'policies'>('overview');

  useEffect(() => {
    getClient()
      .getInfrastructureTenant(id)
      .then((r) => setData(r.data))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  const services = data?.services || [];

  return (
    <>
      <PageHeader
        title={data?.tenant?.name || 'Tenant usage'}
        description="Service-wise consumption vs quotas with attribution class."
        breadcrumbs={[
          { href: '/infrastructure/tenants', label: 'Tenant Analytics' },
          { label: data?.tenant?.name || String(id).slice(0, 8) },
        ]}
        meta={data ? <StatusBadge status={data.tenant.status} /> : undefined}
        actions={
          <>
            <Button href={`/tenants/${id}`}>Business analytics</Button>
            <Button href={`/infrastructure/tenant-controls?tenant=${id}`} variant="primary">
              Edit controls
            </Button>
          </>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'services', label: 'Service Usage' },
          { id: 'ai', label: 'AI Features' },
          { id: 'queue', label: 'Queue Activity' },
          { id: 'storage', label: 'Storage & Media' },
          { id: 'policies', label: 'Quotas & Policies' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />

      {!data ? (
        <Skeleton height={200} />
      ) : (
        <>
          {(tab === 'overview' || tab === 'services') && (
            <div className="ps-stats">
              {services.map((s: any) => (
                <UtilizationMeter
                  key={s.service}
                  label={s.service.replace(/_/g, ' ')}
                  value={typeof s.current === 'number' ? s.current : s.current == null ? null : Number(s.current)}
                  max={typeof s.quota === 'number' ? s.quota : null}
                  unit={s.unit}
                  hint={s.hint}
                  attribution={s.attribution}
                  valueKind={s.value_kind === 'bytes' || s.service === 'media' ? 'bytes' : 'number'}
                />
              ))}
            </div>
          )}

          {tab === 'ai' && (
            <Card title="AI features">
              <ul className="ps-link-list">
                {Object.entries(data.policies?.ai_features || {}).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}</strong>
                    <span className="ps-muted">{String(v)}</span>
                  </li>
                ))}
              </ul>
              <p className="ps-muted" style={{ marginTop: 12 }}>
                AI tick counts are attributed when monitor-tick runs. Concurrency quota: {data.policies?.ai_concurrency}.
              </p>
            </Card>
          )}

          {tab === 'queue' && (
            <Card title="Queue activity">
              <pre className="ps-code">{JSON.stringify(services.find((s: any) => s.service === 'queue')?.current || {}, null, 2)}</pre>
            </Card>
          )}

          {tab === 'storage' && (
            <Card title="Storage & media">
              <p>
                Storage used: <strong>{formatBytes(data.usage?.totals?.storage_bytes)}</strong>
              </p>
              <p>
                Egress: <strong>{formatBytes(data.usage?.totals?.bytes_egress)}</strong>
              </p>
              <p className="ps-muted">Quota {formatCount(data.policies?.storage_mb)} MB · Daily egress threshold {formatCount(data.policies?.daily_egress_mb)} MB</p>
            </Card>
          )}

          {tab === 'policies' && (
            <Card title="Configured policies">
              <pre className="ps-code">{JSON.stringify(data.policies, null, 2)}</pre>
            </Card>
          )}
        </>
      )}
    </>
  );
}
