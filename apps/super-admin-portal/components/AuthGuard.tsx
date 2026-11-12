'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@proctorshield/ui-components';
import { superAdminTokens } from '@/lib/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authed' | 'redirecting'>('checking');

  useEffect(() => {
    if (superAdminTokens.get()) {
      setStatus('authed');
    } else {
      setStatus('redirecting');
      router.replace('/login');
    }
  }, [router]);

  if (status !== 'authed') {
    return (
      <div style={{ padding: 48 }}>
        <Spinner label={status === 'checking' ? 'Loading…' : 'Redirecting to login…'} />
      </div>
    );
  }
  return <>{children}</>;
}
