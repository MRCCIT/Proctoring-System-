'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ExamCandidateExplorer } from '@/components/exam-explorer/ExamCandidateExplorer';

export default function ReviewExamCandidateDetailPage() {
  const { examId, sessionId } = useParams<{ examId: string; sessionId: string }>();
  return (
    <AuthGuard>
      <TenantAdminShell>
        <ExamCandidateExplorer mode="review" examId={examId} selectedSessionId={sessionId} />
      </TenantAdminShell>
    </AuthGuard>
  );
}
