'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function SessionDetailSaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<unknown>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .getSessionSa(id)
      .then((r) => setData(r.data))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Session (cross-tenant)</h1>
        <p className="muted">GET /v1/superadmin/sessions/:id</p>
        {err && <p className="error">{err}</p>}
        <Card>
          <pre className="json">{JSON.stringify(data, null, 2)}</pre>
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
