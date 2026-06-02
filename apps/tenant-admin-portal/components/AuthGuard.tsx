'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tenantTokens } from '@/lib/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authed' | 'redirecting'>('checking');

  useEffect(() => {
    if (tenantTokens.get()) {
      setStatus('authed');
    } else {
      setStatus('redirecting');
      router.replace('/login');
    }
  }, [router]);

  if (status !== 'authed') {
    return (
      <div suppressHydrationWarning style={{ padding: 24, color: '#64748b', fontFamily: 'system-ui' }}>
        {status === 'checking' ? 'Loading...' : 'Redirecting to login...'}
      </div>
    );
  }
  return <>{children}</>;
}
