'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';
import type { TenantSummary } from '@proctorshield/shared-types';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = (c?: string) => {
    getClient()
      .listTenants(c)
      .then((r) => {
        setTenants(c ? (prev) => [...prev, ...r.data] : r.data);
        setNext(r.next_cursor);
      })
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Tenants</h1>
        <p>
          <Link href="/tenants/new">Create tenant</Link> · GET /v1/superadmin/tenants
        </p>
        {err && <p className="error">{err}</p>}
        <DataTable headers={['Name', 'Slug', 'Status', 'Sessions', '']}>
          {tenants.map((t) => (
            <tr key={t.id}>
              <Td>{t.name}</Td>
              <Td>{t.slug}</Td>
              <Td>{t.status}</Td>
              <Td>
                {t.usage.active_sessions} active / {t.usage.total_sessions} total
              </Td>
              <Td>
                <Link href={`/tenants/${t.id}`}>View</Link>
              </Td>
            </tr>
          ))}
        </DataTable>
        {next && (
          <button type="button" onClick={() => load(next)}>
            Load more
          </button>
        )}
      </SuperAdminShell>
    </AuthGuard>
  );
}
