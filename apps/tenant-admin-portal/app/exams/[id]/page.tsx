'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function ExamSessionsPage() {
  const { id } = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .listExamSessions(id)
      .then((r) => setSessions(r.data as Record<string, unknown>[]))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Exam sessions</h1>
        <p className="muted">GET /v1/exams/:examId/sessions</p>
        {err && <p className="error">{err}</p>}
        <DataTable headers={['Session', 'Status', 'Candidate', '']}>
          {sessions.map((s) => (
            <tr key={String(s.id)}>
              <Td>{String(s.id).slice(0, 8)}…</Td>
              <Td>{String(s.status)}</Td>
              <Td>{String(s.external_ref || '—')}</Td>
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
