'use client';

import { useEffect, useState } from 'react';
import { Alert, Card, KeyValue, PageHeader, Spinner, StatusBadge } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { api } from '@/lib/tenantApi';

type AiHealthData = {
  ok: boolean;
  url?: string;
  latency_ms?: number | null;
  http_status?: number | null;
  error?: string | null;
  body?: Record<string, unknown> | null;
};

export default function AiHealthPage() {
  const [data, setData] = useState<AiHealthData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ data: AiHealthData }>('GET', '/v1/tenant/ai-health')
      .then((r) => setData(r.data))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader title="AI health" description="Live probe of the proctoring AI sidecar for your tenant." />
        {err && <Alert tone="danger">{err}</Alert>}
        {loading && !data ? (
          <Spinner label="Checking AI service…" />
        ) : data ? (
          <Card>
            <p style={{ marginBottom: 16 }}>
              <StatusBadge status={data.ok ? 'active' : 'failed'} label={data.ok ? 'Reachable' : 'Unreachable'} />
            </p>
            <KeyValue
              items={[
                { label: 'Service URL', value: data.url || '—' },
                { label: 'Latency', value: data.latency_ms != null ? `${data.latency_ms} ms` : '—' },
                { label: 'HTTP status', value: data.http_status != null ? String(data.http_status) : '—' },
                { label: 'Error', value: data.error || '—' },
              ]}
            />
          </Card>
        ) : null}
      </TenantAdminShell>
    </AuthGuard>
  );
}
