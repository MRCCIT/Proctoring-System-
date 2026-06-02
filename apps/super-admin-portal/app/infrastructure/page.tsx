'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function InfrastructurePage() {
  const [health, setHealth] = useState<unknown>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .getInfrastructureHealth()
      .then((r) => setHealth(r.data))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Infrastructure health</h1>
        <p className="muted">GET /v1/superadmin/infrastructure/health</p>
        {err && <p className="error">{err}</p>}
        <Card>
          <pre className="json">{JSON.stringify(health, null, 2)}</pre>
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
