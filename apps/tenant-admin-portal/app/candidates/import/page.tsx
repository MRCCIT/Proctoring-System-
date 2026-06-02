'use client';

import { useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function BulkImportPage() {
  const [csv, setCsv] = useState('email,name,external_ref\nstudent@example.com,Jane Doe,stu-100');
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await getClient().bulkImportCandidates({ csv });
      setResult(res.data);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Bulk import candidates</h1>
        <p className="muted">POST /v1/candidates/bulk-import</p>
        <Card>
          <form onSubmit={submit}>
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} style={{ width: '100%' }} />
            {err && <p className="error">{err}</p>}
            <button type="submit" className="primary">
              Import
            </button>
          </form>
          {result && <pre className="json">{JSON.stringify(result, null, 2)}</pre>}
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
