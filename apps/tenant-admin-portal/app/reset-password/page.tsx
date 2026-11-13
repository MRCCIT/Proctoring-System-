'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Icon, Spinner } from '@proctorshield/ui-components';
import { getClient, saveProfile, signOut, tenantTokens } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [meta, setMeta] = useState<{ email: string; tenant_slug: string; tenant_name?: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    if (!t) {
      setErr('Missing reset token. Request a new link from Forgot password.');
      setLoading(false);
      return;
    }
    getClient()
      .peekTenantReset(t)
      .then((res) => setMeta(res.data))
      .catch((e) => setErr((e as Error).message || 'Reset link is invalid or expired.'))
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
      signOut();
      const res = await getClient().resetTenantPassword({ token, password });
      tenantTokens.set(res.access_token);
      saveProfile({
        name: res.user?.display_name || null,
        email: res.user?.email || meta?.email || null,
        org: res.tenant?.slug || meta?.tenant_slug || null,
        role: res.user?.role || null,
        impersonation: false,
        impersonator_email: null,
      });
      if (res.tenant?.slug) localStorage.setItem('ps_tenant_last_slug', res.tenant.slug);
      router.push('/dashboard');
    } catch (ex) {
      setErr((ex as Error).message || 'Could not reset password');
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
        <h1>Reset password</h1>
        <p className="ps-muted" style={{ marginTop: 4 }}>
          Choose a new password for your organization admin account.
        </p>
        {loading ? <Spinner label="Validating link…" /> : null}
        {err && <Alert tone="danger">{err}</Alert>}
        {!loading && meta ? (
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            <Field label="Organization">
              <input value={meta.tenant_name || meta.tenant_slug} disabled />
            </Field>
            <Field label="Work email">
              <input type="email" value={meta.email} disabled />
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
              Save password
            </Button>
          </form>
        ) : null}
        <p className="ps-muted" style={{ marginTop: 16 }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
      <div className="auth-aside">
        <div>
          <h2>Secure reset</h2>
          <p>This link works once. After you save a new password you are signed in automatically.</p>
        </div>
      </div>
    </div>
  );
}
