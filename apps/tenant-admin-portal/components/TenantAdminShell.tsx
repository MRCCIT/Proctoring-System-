'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@proctorshield/ui-components';
import { tenantTokens } from '@/lib/api';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/exams', label: 'Exams' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/live', label: 'Live' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/policies', label: 'Policies' },
  { href: '/templates', label: 'Templates' },
  { href: '/users', label: 'Sub-admins' },
  { href: '/branding', label: 'Branding' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/reports', label: 'Reports' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/settings', label: 'SDK settings' },
];

export function TenantAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  return (
    <AppShell
      title="ProctorShield Tenant Admin"
      links={LINKS}
      onLinkClick={(href) => {
        if (href !== pathname) setNavigating(true);
      }}
      onLogout={() => {
        tenantTokens.clear();
        router.push('/login');
      }}
    >
      <div className="shell-main-wrap">
        {navigating ? (
          <div className="nav-loading-overlay" aria-busy="true" aria-label="Loading">
            <div className="nav-spinner" />
          </div>
        ) : null}
        {children}
      </div>
    </AppShell>
  );
}
