'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function CandidatesPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .listCandidates()
      .then((r) => setItems(r.data as Record<string, unknown>[]))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Candidates</h1>
        <p>
          <Link href="/candidates/import">Bulk import</Link> · GET /v1/candidates
        </p>
        {err && <p className="error">{err}</p>}
        <DataTable headers={['Email', 'Name', 'External ref', '']}>
          {items.map((c) => (
            <tr key={String(c.id)}>
              <Td>{String(c.email)}</Td>
              <Td>{String(c.name || '—')}</Td>
              <Td>{String(c.external_ref || '—')}</Td>
              <Td>{String(c.id).slice(0, 8)}…</Td>
            </tr>
          ))}
        </DataTable>
      </TenantAdminShell>
    </AuthGuard>
  );
}
