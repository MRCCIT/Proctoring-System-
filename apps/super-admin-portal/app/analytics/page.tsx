'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function AnalyticsPage() {
  const [compare, setCompare] = useState<unknown[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .getTenantsCompare()
      .then((r) => setCompare(r.data))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Tenant comparison</h1>
        <p className="muted">GET /v1/superadmin/analytics/tenants/compare</p>
        {err && <p className="error">{err}</p>}
        <Card>
          <pre className="json">{JSON.stringify(compare, null, 2)}</pre>
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
