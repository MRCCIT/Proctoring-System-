'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ExamListView } from '@/components/exam-explorer/ExamListView';

export default function LivePage() {
  return (
    <AuthGuard>
      <TenantAdminShell>
        <ExamListView mode="live" />
      </TenantAdminShell>
    </AuthGuard>
  );
}
