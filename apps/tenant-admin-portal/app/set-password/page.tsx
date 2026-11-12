'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Icon, Spinner } from '@proctorshield/ui-components';
import { getClient, saveProfile, tenantTokens } from '@/lib/api';

export default function SetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [meta, setMeta] = useState<{
    email: string;
    tenant_slug: string;
    tenant_name?: string;
    display_name?: string | null;
  } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    if (!t) {
      setErr('Missing invite token. Ask your platform admin for a new invite link.');
      setLoading(false);
      return;
    }
    getClient()
      .peekTenantInvite(t)
      .then((res) => {
        setMeta(res.data);
        setDisplayName(res.data.display_name || '');
      })
      .catch((e) => setErr((e as Error).message || 'Invite link is invalid or expired.'))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await getClient().acceptTenantInvite({
        token,
        password,
        display_name: displayName.trim() || undefined,
      });
      tenantTokens.set(res.access_token);
      saveProfile({
        name: res.user?.display_name || displayName || null,
        email: res.user?.email || meta?.email || null,
        org: res.tenant?.slug || meta?.tenant_slug || null,
        role: res.user?.role || null,
      });
      if (res.tenant?.slug) localStorage.setItem('ps_tenant_last_slug', res.tenant.slug);
      router.push('/dashboard');
    } catch (ex) {
      setErr((ex as Error).message || 'Could not set password');
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
        <h1>Create your password</h1>
        <p className="ps-muted" style={{ marginTop: 4 }}>
          First-time setup for your organization admin account. Next time you will sign in normally.
        </p>
        {loading ? <Spinner label="Validating invite…" /> : null}
        {err && <Alert tone="danger">{err}</Alert>}
        {!loading && meta ? (
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            <Field label="Organization">
              <input value={meta.tenant_name || meta.tenant_slug} disabled />
            </Field>
            <Field label="Work email">
              <input type="email" value={meta.email} disabled />
            </Field>
            <Field label="Display name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="New password" hint="At least 8 characters." required>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Confirm password" required>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Button type="submit" variant="primary" loading={busy} className="auth-submit">
              Activate account
            </Button>
          </form>
        ) : null}
        <p className="ps-muted" style={{ marginTop: 16 }}>
          Already activated? <Link href="/login">Sign in</Link>
        </p>
      </div>
      <div className="auth-aside">
        <div>
          <h2>Welcome to your org console</h2>
          <p>Set a password once. After that, use email + password — and Forgot password if you ever need a reset.</p>
        </div>
      </div>
    </div>
  );
}
