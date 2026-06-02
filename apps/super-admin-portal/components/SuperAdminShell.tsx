'use client';

import { useRouter } from 'next/navigation';
import { AppShell } from '@proctorshield/ui-components';
import { superAdminTokens } from '@/lib/api';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/tenants', label: 'Tenants' },
  { href: '/sessions', label: 'Active sessions' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/audit-logs', label: 'Audit logs' },
  { href: '/infrastructure', label: 'Infrastructure' },
];

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <AppShell
      title="ProctorShield Super Admin"
      links={LINKS}
      onLogout={() => {
        superAdminTokens.clear();
        router.push('/login');
      }}
    >
      {children}
    </AppShell>
  );
}
