'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function ExamsPage() {
  const [exams, setExams] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .listExams()
      .then((r) => setExams(r.data as Record<string, unknown>[]))
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Exams</h1>
        <p>
          <Link href="/exams/new">Create exam</Link> · GET /v1/exams
        </p>
        {err && <p className="error">{err}</p>}
        <DataTable headers={['Title', 'Sensitivity', 'Created', '']}>
          {exams.map((e) => (
            <tr key={String(e.id)}>
              <Td>{String(e.title)}</Td>
              <Td>{String(e.ai_sensitivity)}</Td>
              <Td>{String(e.created_at)}</Td>
              <Td>
                <Link href={`/exams/${e.id}`}>Sessions</Link> ·{' '}
                <Link href={`/reports/${e.id}`}>Report</Link>
              </Td>
            </tr>
          ))}
        </DataTable>
      </TenantAdminShell>
    </AuthGuard>
  );
}
