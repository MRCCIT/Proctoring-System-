'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import type { TenantSummary } from '@proctorshield/shared-types';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const client = getClient();

  useEffect(() => {
    client
      .getTenant(id)
      .then((r) => setTenant(r.data))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  const suspend = async () => {
    await client.suspendTenant(id);
    const r = await client.getTenant(id);
    setTenant(r.data);
  };

  const rotateKey = async () => {
    const r = await client.rotateTenantKey(id);
    setApiKey(r.api_key);
    setTenant(r.data);
  };

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Tenant detail</h1>
        <p className="muted">GET /v1/superadmin/tenants/:id</p>
        {err && <p className="error">{err}</p>}
        {tenant && (
          <>
            <Card title={tenant.name}>
              <pre className="json">{JSON.stringify(tenant, null, 2)}</pre>
            </Card>
            <p>
              <button type="button" onClick={() => void suspend()} disabled={tenant.status === 'suspended'}>
                Suspend tenant
              </button>{' '}
              <button type="button" onClick={() => void rotateKey()}>
                Rotate API key
              </button>
            </p>
            {apiKey && (
              <p>
                <strong>New API key:</strong> <code>{apiKey}</code>
              </p>
            )}
          </>
        )}
      </SuperAdminShell>
    </AuthGuard>
  );
}
