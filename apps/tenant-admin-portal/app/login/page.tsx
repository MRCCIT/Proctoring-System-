'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Icon } from '@proctorshield/ui-components';
import { getClient, saveProfile, tenantTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tenant_slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).has('expired'));
    const last = localStorage.getItem('ps_tenant_last_slug');
    if (last) setSlug(last);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = (await getClient().tenantLogin(tenant_slug.trim(), email.trim(), password)) as {
        access_token: string;
        tenant?: { slug?: string };
        user?: { display_name?: string; email?: string; role?: string };
      };
      tenantTokens.set(res.access_token);
      const slug = res.tenant?.slug || tenant_slug.trim();
      saveProfile({
        name: res.user?.display_name || null,
        email: res.user?.email || email,
        tenant_slug: slug,
        tenant_name: slug,
        org: slug,
        role: res.user?.role || null,
      });
      localStorage.setItem('ps_tenant_last_slug', slug);
      router.push('/dashboard');
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
            Sign in
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
