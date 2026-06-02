'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function AnalyticsPage() {
  const [usage, setUsage] = useState<unknown>(null);
  const [violations, setViolations] = useState<unknown>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const c = getClient();
    Promise.all([c.getUsageAnalytics(), c.getViolationsAnalytics()])
      .then(([u, v]) => {
        setUsage(u.data);
        setViolations(v.data);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Analytics</h1>
        <p className="muted">GET /v1/analytics/usage · GET /v1/analytics/violations</p>
        {err && <p className="error">{err}</p>}
        <Card title="Usage">
          <pre className="json">{JSON.stringify(usage, null, 2)}</pre>
        </Card>
        <Card title="Violation trends">
          <pre className="json">{JSON.stringify(violations, null, 2)}</pre>
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
