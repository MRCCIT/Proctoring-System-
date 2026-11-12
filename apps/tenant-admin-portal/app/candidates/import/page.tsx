'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';

/** Bulk import removed — candidates are created automatically when they start an exam. */
export default function CandidatesImportRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/candidates');
  }, [router]);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <Spinner label="Redirecting to candidates…" />
      </TenantAdminShell>
    </AuthGuard>
  );
}
