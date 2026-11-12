'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@proctorshield/ui-components';
import { getClient, loadProfile, saveProfile, signOut, type SuperProfile } from '@/lib/api';

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
  const pathname = usePathname();
  const [profile, setProfile] = useState<SuperProfile | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    let alive = true;
    getClient()
      .superadminMe()
      .then((res) => {
        if (!alive) return;
        const next: SuperProfile = {
          email: res.data.email,
          name: res.data.display_name || res.data.email,
        };
        saveProfile(next);
        setProfile(next);
      })
      .catch(() => {
        /* keep cached profile */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell
      title="ProctorShield Super Admin"
      subtitle="Platform console"
      links={LINKS}
      pathname={pathname || undefined}
      user={
        profile
          ? {
              name: profile.name || profile.email || 'Super admin',
              email: profile.email,
              org: 'Super admin',
            }
          : null
      }
      onLogout={() => {
        signOut();
        router.push('/login');
      }}
    >
      {children}
    </AppShell>
  );
}
