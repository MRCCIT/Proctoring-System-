'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ExamCandidateExplorer } from '@/components/exam-explorer/ExamCandidateExplorer';

export default function ReviewExamCandidatesPage() {
  const { examId } = useParams<{ examId: string }>();
  return (
    <AuthGuard>
      <TenantAdminShell>
        <ExamCandidateExplorer mode="review" examId={examId} />
      </TenantAdminShell>
    </AuthGuard>
  );
}
