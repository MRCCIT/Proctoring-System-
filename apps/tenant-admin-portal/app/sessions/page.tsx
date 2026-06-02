'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function SessionsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .listSessions()
      .then((r) => setItems(r.data as Record<string, unknown>[]))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>All sessions</h1>
        <p className="muted">GET /v1/sessions</p>
        {err && <p className="error">{err}</p>}
        <DataTable headers={['Session', 'Exam', 'Status', '']}>
          {items.map((s) => (
            <tr key={String(s.id)}>
              <Td>{String(s.id).slice(0, 8)}…</Td>
              <Td>{String(s.exam_title || '—')}</Td>
              <Td>{String(s.status)}</Td>
              <Td>
                <Link href={`/sessions/${s.id}`}>Detail</Link>
              </Td>
            </tr>
          ))}
        </DataTable>
      </TenantAdminShell>
    </AuthGuard>
  );
}
