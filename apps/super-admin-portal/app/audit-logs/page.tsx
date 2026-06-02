'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<unknown[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    getClient()
      .listAuditLogs({ tenant_id: tenantId || undefined })
      .then((r) => setLogs(r.data))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Audit logs</h1>
        <p className="muted">GET /v1/superadmin/audit-logs</p>
        <p>
          <input placeholder="Filter tenant_id (UUID)" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          <button type="button" onClick={load}>
            Filter
          </button>
        </p>
        {err && <p className="error">{err}</p>}
        <Card>
          <pre className="json">{JSON.stringify(logs, null, 2)}</pre>
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
