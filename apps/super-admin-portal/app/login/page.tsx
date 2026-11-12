'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Icon } from '@proctorshield/ui-components';
import { getClient, saveProfile, superAdminTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await getClient().superadminLogin(email.trim(), password);
      superAdminTokens.set(res.access_token);
      saveProfile({
        email: res.user?.email || email.trim(),
        name: res.user?.display_name || res.user?.email || email.trim(),
      });
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
        <h1>Platform console</h1>
        <p className="ps-muted" style={{ marginTop: 4 }}>
          Manage tenants, monitor platform health and review cross-tenant activity.
        </p>
        {err && <Alert tone="danger">{err}</Alert>}
        <form onSubmit={submit} style={{ marginTop: 18 }}>
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
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
      </div>
      <div className="auth-aside">
        <div>
          <h2>Operator control plane</h2>
          <p>
            Create and suspend tenant organizations, inspect live sessions across the fleet, and keep an eye on
            infrastructure health — without touching assessment content.
          </p>
          <ul>
            <li>Tenant provisioning and API key rotation</li>
            <li>Cross-tenant live session visibility</li>
            <li>Usage comparison and audit trail</li>
            <li>Live service health probes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
