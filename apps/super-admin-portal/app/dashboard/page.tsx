'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function DashboardPage() {
  const [platform, setPlatform] = useState<unknown>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .getPlatformAnalytics()
      .then((r) => setPlatform(r.data))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Platform dashboard</h1>
        <p className="muted">GET /v1/superadmin/analytics/platform</p>
        {err && <p className="error">{err}</p>}
        <Card title="Summary">
          <pre className="json">{JSON.stringify(platform, null, 2)}</pre>
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
