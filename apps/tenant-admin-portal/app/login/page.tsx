'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Icon } from '@proctorshield/ui-components';
import { API_BASE, saveProfile, signOut, tenantTokens } from '@/lib/api';
import { ProctorShieldClient } from '@proctorshield/sdk';
import { isImpersonationSession } from '@/lib/authSession';

export default function LoginPage() {
  const router = useRouter();
  const [tenant_slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [wasImpersonating, setWasImpersonating] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setExpired(q.has('expired'));
    const last = localStorage.getItem('ps_tenant_last_slug');
    if (last) setSlug(last);

    // Leftover Super Admin handoff session — show notice; signing in replaces it.
    if (isImpersonationSession()) setWasImpersonating(true);
  }, []);

  const exitImpersonation = () => {
    signOut();
    setWasImpersonating(false);
    setErr('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      // Always wipe prior SA handoff / expired tokens so banners cannot stick.
      signOut();

      // Login must not send a leftover Bearer token.
      const client = new ProctorShieldClient({ baseUrl: API_BASE });
      const res = (await client.tenantLogin(tenant_slug.trim(), email.trim(), password)) as {
        access_token: string;
        tenant?: { slug?: string; name?: string };
        user?: { display_name?: string; email?: string; role?: string };
      };

      tenantTokens.set(res.access_token);
      const slug = res.tenant?.slug || tenant_slug.trim();
      saveProfile({
        name: res.user?.display_name || null,
        email: res.user?.email || email,
        tenant_slug: slug,
        tenant_name: res.tenant?.name || slug,
        org: res.tenant?.name || slug,
        role: res.user?.role || null,
        impersonation: false,
        impersonator_email: null,
      });
      localStorage.setItem('ps_tenant_last_slug', slug);
      setWasImpersonating(false);

      const role = res.user?.role || '';
      router.replace(role === 'proctor' || role === 'viewer' ? '/proctor' : '/dashboard');
    } catch (ex) {
      setErr((ex as Error).message || 'Sign in failed');
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="ps-brand-mark">
            <Icon name="shield" size={18} />
          </span>
          <strong>ProctorShield</strong>
        </div>
        <h1>Sign in to your organization</h1>
        <p className="ps-muted" style={{ marginTop: 4 }}>
          Monitor sessions, review integrity evidence and manage integrations.
        </p>
        {wasImpersonating && (
          <Alert tone="warning" title="Super-admin session still open">
            This browser still has a Super Admin impersonation token. Sign in with your organization admin
            email/password below to switch to a normal tenant session — or clear it first.
            <div style={{ marginTop: 8 }}>
              <Button size="sm" onClick={exitImpersonation}>
                Clear super-admin session
              </Button>
            </div>
          </Alert>
        )}
        {expired && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
        {err && <Alert tone="danger">{err}</Alert>}
        <form onSubmit={submit} style={{ marginTop: 18 }}>
          <Field label="Organization ID" hint="Your organization's workspace slug, e.g. acme-university." required>
            <input value={tenant_slug} onChange={(e) => setSlug(e.target.value)} autoComplete="organization" required />
          </Field>
          <Field label="Work email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password" required>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" variant="primary" loading={busy} className="auth-submit">
            Sign in as organization admin
          </Button>
        </form>
        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </div>
      <div className="auth-aside">
        <div>
          <h2>Proctoring-as-a-Service</h2>
          <p>
            Your assessment platform owns the exam. ProctorShield secures the session — identity, environment and
            behaviour signals — and gives your reviewers the evidence to decide.
          </p>
          <ul>
            <li>Live monitoring with AI-assisted signals</li>
            <li>Evidence timeline linked to the recording</li>
            <li>Human review and integrity reports</li>
            <li>Signed webhooks back to your platform</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
