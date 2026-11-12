'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ExamListView } from '@/components/exam-explorer/ExamListView';

export default function ReviewsPage() {
  return (
    <AuthGuard>
      <TenantAdminShell>
        <ExamListView mode="review" />
      </TenantAdminShell>
    </AuthGuard>
  );
}
