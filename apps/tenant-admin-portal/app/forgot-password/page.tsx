'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Icon } from '@proctorshield/ui-components';
import { API_BASE } from '@/lib/api';
import { ProctorShieldClient } from '@proctorshield/sdk';

export default function ForgotPasswordPage() {
  const [tenant_slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const last = localStorage.getItem('ps_tenant_last_slug');
    if (last) setSlug(last);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    setDevLink(null);
    try {
      // Public auth call — do not attach a stale tenant JWT.
      const res = await new ProctorShieldClient({ baseUrl: API_BASE }).forgotTenantPassword({
        tenant_slug: tenant_slug.trim(),
        email: email.trim(),
      });
      setMsg(res.message || 'If that account exists, reset instructions were issued.');
      setDevLink(res.reset_url || res.invite_url || null);
      localStorage.setItem('ps_tenant_last_slug', tenant_slug.trim());
    } catch (ex) {
      setErr((ex as Error).message || 'Request failed');
    } finally {
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
        <h1>Forgot password</h1>
        <p className="ps-muted" style={{ marginTop: 4 }}>
          Enter your organization ID and work email. We will issue a one-time reset link.
        </p>
        {err && <Alert tone="danger">{err}</Alert>}
        {msg && <Alert tone="success">{msg}</Alert>}
        {devLink && (
          <Alert tone="info" title="Local/dev reset link">
            <a href={devLink}>{devLink}</a>
          </Alert>
        )}
        <form onSubmit={submit} style={{ marginTop: 18 }}>
          <Field label="Organization ID" required>
            <input value={tenant_slug} onChange={(e) => setSlug(e.target.value)} required autoComplete="organization" />
          </Field>
          <Field label="Work email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Button type="submit" variant="primary" loading={busy} className="auth-submit">
            Send reset link
          </Button>
        </form>
        <p className="ps-muted" style={{ marginTop: 16 }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
      <div className="auth-aside">
        <div>
          <h2>Account recovery</h2>
          <p>If you never finished your invite, we will send a set-password link instead of a reset.</p>
        </div>
      </div>
    </div>
  );
}
