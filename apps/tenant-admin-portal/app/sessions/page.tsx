'use client';

import { Suspense } from 'react';
import { Button, Card, PageHeader, Spinner } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { SessionsTable } from '@/components/SessionsTable';

function SessionsContent() {
  return (
    <>
      <PageHeader
        title="All sessions"
        description="Search and filter every proctoring session across exams. Open a row for the full review player."
        actions={
          <Button href="/reviews" icon="review">
            Review queue
          </Button>
        }
      />
      <Card>
        <SessionsTable
          showExam
          showFilters
          emptyTitle="No sessions yet"
          emptyDescription="Sessions appear when candidates start proctoring through your integration or a candidate link."
        />
      </Card>
    </>
  );
}

export default function SessionsPage() {
  return (
    <AuthGuard>
      <TenantAdminShell>
        <Suspense fallback={<Spinner label="Loading sessions…" />}>
          <SessionsContent />
        </Suspense>
      </TenantAdminShell>
    </AuthGuard>
  );
}
