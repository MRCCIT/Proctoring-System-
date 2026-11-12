'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ExamCandidateExplorer } from '@/components/exam-explorer/ExamCandidateExplorer';

export default function LiveExamCandidatesPage() {
  const { examId } = useParams<{ examId: string }>();
  return (
    <AuthGuard>
      <TenantAdminShell>
        <ExamCandidateExplorer mode="live" examId={examId} />
      </TenantAdminShell>
    </AuthGuard>
  );
}
