'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Alert, AppShell, Button, type NavSection } from '@proctorshield/ui-components';
import { loadProfile, saveProfile, signOut, type TenantProfile } from '@/lib/api';
import { api, AUTH_SOFT_FAIL_EVENT } from '@/lib/tenantApi';
import {
  formatRemaining,
  getAccessTokenClaims,
  getTokenSecondsRemaining,
  isImpersonationSession,
  isTokenExpired,
  isTokenNearExpiry,
  syncProfileWithToken,
} from '@/lib/authSession';
import { usePageVisible } from '@/hooks/usePageVisible';

function buildAdminSections(live: number, review: number): NavSection[] {
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
        { href: '/users', label: 'Proctors', icon: 'users' },
        { href: '/policies', label: 'Policies', icon: 'shield' },
        { href: '/reports', label: 'Exports', icon: 'report' },
      ],
    },
  ];
}

function buildProctorSections(assigned: number): NavSection[] {
  return [
    {
      items: [
        { href: '/proctor', label: 'My dashboard', icon: 'home', badge: assigned || null },
        { href: '/proctor', label: 'My candidates', icon: 'users' },
        { href: '/live', label: 'Live monitoring', icon: 'live' },
        { href: '/reviews', label: 'Review queue', icon: 'review' },
      ],
    },
  ];
}

export function TenantAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const visible = usePageVisible();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [counts, setCounts] = useState({ live: 0, review: 0, assigned: 0 });
  const [softAuthFail, setSoftAuthFail] = useState(false);
  const [tokenRem, setTokenRem] = useState<number | null>(null);

  useEffect(() => {
    const raw = loadProfile();
    const synced = syncProfileWithToken(raw);
    if (synced && raw && JSON.stringify(synced) !== JSON.stringify(raw)) {
      saveProfile(synced);
    }
    setProfile(synced);
  }, [pathname]);

  useEffect(() => {
    const onSoft = () => setSoftAuthFail(true);
    window.addEventListener(AUTH_SOFT_FAIL_EVENT, onSoft);
    return () => window.removeEventListener(AUTH_SOFT_FAIL_EVENT, onSoft);
  }, []);

  useEffect(() => {
    const tick = () => setTokenRem(getTokenSecondsRemaining());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const isProctor = profile?.role === 'proctor' || profile?.role === 'viewer';
  const impersonating = isImpersonationSession(profile);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const load = async () => {
      try {
        if (isProctor) {
          const r = await api<{ summary?: { total?: number } }>(
            'GET',
            '/v1/tenant/proctoring/me/assignments',
            undefined,
            { auth: 'soft' }
          );
          if (alive) {
            setCounts((c) => ({ ...c, assigned: r.summary?.total || 0 }));
            setSoftAuthFail(false);
          }
        } else {
          const r = await api<{ data: { totals: { live_sessions: number; awaiting_review: number } } }>(
            'GET',
            '/v1/tenant/overview',
            undefined,
            { auth: 'soft' }
          );
          if (alive) {
            setCounts({
              live: r.data.totals.live_sessions,
              review: r.data.totals.awaiting_review,
              assigned: 0,
            });
            setSoftAuthFail(false);
          }
        }
      } catch {
        /* soft — banner handles auth noise */
      }
    };
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isProctor, visible]);

  const sections = useMemo(
    () => (isProctor ? buildProctorSections(counts.assigned) : buildAdminSections(counts.live, counts.review)),
    [isProctor, counts]
  );

  const orgName = profile?.tenant_name || profile?.tenant_slug || profile?.org || null;
  const nearExpiry = tokenRem !== null && isTokenNearExpiry();
  const expired = tokenRem !== null && isTokenExpired();

  return (
    <AppShell
      title="ProctorShield"
      subtitle={
        isProctor
          ? `Proctor · ${orgName || 'Organization'}`
          : orgName
            ? `Organization · ${orgName}`
            : 'Organization console'
      }
      sections={sections}
      pathname={pathname}
      user={profile ? { name: profile.name, email: profile.email, org: profile.role ? `${profile.role}` : orgName } : null}
      onLogout={() => {
        signOut();
        router.push('/login');
      }}
    >
      {impersonating ? (
        <Alert tone="warning" title="Super-admin access">
          You are viewing this organization as{' '}
          {profile?.impersonator_email ||
            getAccessTokenClaims()?.impersonator_email ||
            getAccessTokenClaims()?.email ||
            'a platform super admin'}
          . Actions are audited. This is not an organization-admin login — sign in with tenant credentials to clear
          this banner.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                signOut();
                router.push('/login');
              }}
            >
              Sign in as organization admin
            </Button>
            <Button
              size="sm"
              onClick={() => {
                signOut();
                router.push('/login');
              }}
            >
              End super-admin session
            </Button>
          </div>
        </Alert>
      ) : null}
      {softAuthFail || expired ? (
        <Alert tone="danger" title={expired ? 'Session expired' : 'Connection interrupted'}>
          {impersonating
            ? 'Your admin access token is no longer valid. Re-open this organization from Super Admin, or sign in as a tenant admin.'
            : 'Your login session could not be verified. Sign in again to continue making changes — open pages stay available until then.'}
          <div style={{ marginTop: 8 }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                signOut();
                router.push('/login?expired=1');
              }}
            >
              Sign in again
            </Button>
          </div>
        </Alert>
      ) : nearExpiry && tokenRem !== null ? (
        <Alert tone="warning" title="Session ending soon">
          {impersonating ? (
            <>
              Impersonation access expires in {formatRemaining(tokenRem)}. Finish review work, re-open from Super
              Admin, or{' '}
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
                onClick={() => {
                  signOut();
                  router.push('/login');
                }}
              >
                switch to organization admin login
              </button>
              .
            </>
          ) : (
            <>Your login expires in {formatRemaining(tokenRem)}. Save work and sign in again if needed.</>
          )}
        </Alert>
      ) : null}
      {children}
    </AppShell>
  );
}
