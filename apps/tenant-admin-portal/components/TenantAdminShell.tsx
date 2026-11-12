'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell, type NavSection } from '@proctorshield/ui-components';
import { loadProfile, signOut, type TenantProfile } from '@/lib/api';
import { api } from '@/lib/tenantApi';

function buildSections(live: number, review: number): NavSection[] {
  return [
    {
      items: [
        { href: '/dashboard', label: 'Overview', icon: 'home' },
        { href: '/live', label: 'Live monitoring', icon: 'live', badge: live || null },
        { href: '/reviews', label: 'Review queue', icon: 'review', badge: review || null },
      ],
    },
    {
      title: 'Proctoring',
      items: [
        { href: '/exams', label: 'Exams', icon: 'exam' },
        { href: '/sessions', label: 'Sessions', icon: 'sessions' },
        { href: '/candidates', label: 'Candidates', icon: 'users' },
        { href: '/analytics', label: 'Analytics', icon: 'chart' },
      ],
    },
    {
      title: 'Integrations',
      items: [{ href: '/settings', label: 'API & SDK', icon: 'plug' }],
    },
    {
      title: 'Advanced',
      items: [
        { href: '/users', label: 'Team', icon: 'users' },
        { href: '/policies', label: 'Policies', icon: 'shield' },
        { href: '/reports', label: 'Exports', icon: 'report' },
      ],
    },
  ];
}

export function TenantAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [counts, setCounts] = useState({ live: 0, review: 0 });

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ data: { totals: { live_sessions: number; awaiting_review: number } } }>('GET', '/v1/tenant/overview')
        .then((r) => alive && setCounts({ live: r.data.totals.live_sessions, review: r.data.totals.awaiting_review }))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const orgName = profile?.tenant_name || profile?.tenant_slug || profile?.org || null;

  return (
    <AppShell
      title="ProctorShield"
      subtitle={orgName ? `Organization · ${orgName}` : 'Organization console'}
      sections={buildSections(counts.live, counts.review)}
      pathname={pathname}
      user={profile ? { name: profile.name, email: profile.email, org: profile.role ? `${profile.role}` : orgName } : null}
      onLogout={() => {
        signOut();
        router.push('/login');
      }}
    >
      {children}
    </AppShell>
  );
}
