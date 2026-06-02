'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { UsageDashboard, DashboardSkeleton } from '@/components/dashboard/UsageDashboard';
import type { UsageAnalytics } from '@/lib/analyticsTypes';
import { getClient } from '@/lib/api';

export default function DashboardPage() {
  const [usage, setUsage] = useState<UsageAnalytics | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClient()
      .getUsageAnalytics()
      .then((r) => setUsage(r.data as UsageAnalytics))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        {err && <p className="error">{err}</p>}
        {loading && !usage ? <DashboardSkeleton /> : null}
        {usage ? <UsageDashboard data={usage} /> : null}
      </TenantAdminShell>
    </AuthGuard>
  );
}
