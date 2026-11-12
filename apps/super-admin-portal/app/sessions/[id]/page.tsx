'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  CopyButton,
  Icon,
  KeyValue,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import { formatBytes, formatCount, formatDateTime, relativeTime } from '@/lib/format';

type SessionDetail = Record<string, unknown> & {
  id: string;
  status?: string;
  connection_state?: string | null;
  tenant_id?: string;
  tenant_name?: string;
  tenant_slug?: string;
  exam_title?: string | null;
  candidate_name?: string | null;
  display_candidate_name?: string | null;
  candidate_email?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  last_heartbeat_at?: string | null;
  storage_bytes?: number | string;
  bytes_egress?: number | string;
  violation_flags?: number;
  review_status?: string | null;
  review_decision?: string | null;
  external_attempt_id?: string | null;
};

export default function SessionDetailSaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .getSessionSa(id)
      .then((r) => setData(r.data as SessionDetail))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  const title = data?.exam_title || `Session ${String(id).slice(0, 8)}`;

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title={title}
          description="Cross-tenant session inspector. Full review tooling lives in the tenant console."
          breadcrumbs={[
            { href: '/sessions', label: 'Active sessions' },
            { label: String(id).slice(0, 8) },
          ]}
          meta={
            data ? (
              <StatusBadge status={String(data.connection_state || data.status || 'unknown')} />
            ) : undefined
          }
          actions={
            <>
              {data?.tenant_id && (
                <Button href={`/tenants/${data.tenant_id}`} icon="building">
                  Open tenant
                </Button>
              )}
              <Button href="/sessions" icon="chevronLeft">
                Back
              </Button>
            </>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <div className="ps-stats">
          {!data ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div className="ps-stat" key={i}>
                <Skeleton width={90} />
                <div style={{ height: 10 }} />
                <Skeleton height={28} width={60} />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Status"
                value={<StatusBadge status={String(data.status || 'unknown')} />}
                hint={data.connection_state ? `Connection: ${data.connection_state}` : undefined}
                icon={<Icon name="live" />}
                tone={data.status === 'active' || data.connection_state === 'connected' ? 'success' : 'default'}
              />
              <StatCard
                label="Violation flags"
                value={formatCount(data.violation_flags ?? 0)}
                icon={<Icon name="alert" />}
                tone={Number(data.violation_flags) > 0 ? 'warning' : 'default'}
              />
              <StatCard
                label="Storage"
                value={formatBytes(data.storage_bytes as string)}
                hint={`${formatBytes(data.bytes_egress as string)} egress`}
                icon={<Icon name="server" />}
              />
              <StatCard
                label="Review"
                value={String(data.review_status || '—').replace(/_/g, ' ')}
                hint={data.review_decision ? String(data.review_decision) : 'No decision yet'}
                icon={<Icon name="review" />}
              />
            </>
          )}
        </div>

        {data && (
          <div className="ps-grid-2" style={{ marginTop: 4 }}>
            <Card title="Session" description="Identity, timing and integrity summary.">
              <KeyValue
                items={[
                  {
                    label: 'Session ID',
                    value: (
                      <span className="ps-inline">
                        <code className="ps-mono">{data.id}</code>
                        <CopyButton value={data.id} />
                      </span>
                    ),
                  },
                  { label: 'Exam', value: String(data.exam_title || 'Untitled exam') },
                  { label: 'Attempt', value: String(data.external_attempt_id || '—') },
                  { label: 'Started', value: formatDateTime(data.started_at as string) },
                  { label: 'Ended', value: formatDateTime(data.ended_at as string) },
                  { label: 'Last heartbeat', value: relativeTime(data.last_heartbeat_at as string) },
                ]}
              />
            </Card>
            <Card title="Tenant" description="Owning organization for this session.">
              <KeyValue
                items={[
                  { label: 'Organization', value: String(data.tenant_name || '—') },
                  {
                    label: 'Slug',
                    value: data.tenant_id ? (
                      <Button size="sm" href={`/tenants/${data.tenant_id}`}>
                        {String(data.tenant_slug || data.tenant_id)}
                      </Button>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: 'Tenant ID',
                    value: (
                      <span className="ps-inline">
                        <code className="ps-mono">{String(data.tenant_id || '—')}</code>
                        {data.tenant_id ? <CopyButton value={String(data.tenant_id)} /> : null}
                      </span>
                    ),
                  },
                ]}
              />
              <Alert tone="info" title="Review evidence in the tenant console">
                Integrity review, recordings and signed evidence URLs are scoped to the tenant organization for
                isolation.
              </Alert>
            </Card>
          </div>
        )}
      </SuperAdminShell>
    </AuthGuard>
  );
}
