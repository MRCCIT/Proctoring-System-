'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function ActiveSessionsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .listActiveSessionsSa()
      .then((r) => setItems(r.data as Record<string, unknown>[]))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Active sessions (all tenants)</h1>
        <p className="muted">GET /v1/superadmin/sessions/active</p>
        {err && <p className="error">{err}</p>}
        <DataTable headers={['Session', 'Tenant', 'Status', '']}>
          {items.map((s) => (
            <tr key={String(s.id)}>
              <Td>{String(s.id).slice(0, 8)}…</Td>
              <Td>{String(s.tenant_slug || s.tenant_id)}</Td>
              <Td>{String(s.status)}</Td>
              <Td>
                <Link href={`/sessions/${s.id}`}>Detail</Link>
              </Td>
            </tr>
          ))}
        </DataTable>
      </SuperAdminShell>
    </AuthGuard>
  );
}
