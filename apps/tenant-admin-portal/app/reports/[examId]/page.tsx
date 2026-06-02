'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function ExamReportPage() {
  const { examId } = useParams<{ examId: string }>();
  const [report, setReport] = useState<unknown>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClient()
      .getExamReport(examId)
      .then((r) => setReport(r.data))
      .catch((e) => setErr((e as Error).message));
  }, [examId]);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Exam report</h1>
        <p className="muted">GET /v1/reports/exam/:examId</p>
        {err && <p className="error">{err}</p>}
        <Card>
          <pre className="json">{JSON.stringify(report, null, 2)}</pre>
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
