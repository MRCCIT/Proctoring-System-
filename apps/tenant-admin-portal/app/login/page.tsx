'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getClient, tenantTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tenant_slug, setSlug] = useState('demo-university');
  const [email, setEmail] = useState('admin@demo.edu');
  const [password, setPassword] = useState('TenantAdmin!123');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await getClient().tenantLogin(tenant_slug, email, password);
      tenantTokens.set(res.access_token);
      router.push('/dashboard');
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <main style={{ padding: 48, maxWidth: 420, margin: '0 auto' }}>
      <h1>Tenant Admin</h1>
      <p className="muted">POST /v1/tenant/auth/login</p>
      <form onSubmit={submit}>
        <p>
          <label>Tenant slug</label>
          <br />
          <input value={tenant_slug} onChange={(e) => setSlug(e.target.value)} style={{ width: '100%' }} />
        </p>
        <p>
          <label>Email</label>
          <br />
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
        </p>
        <p>
          <label>Password</label>
          <br />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
        </p>
        {err && <p className="error">{err}</p>}
        <button type="submit" className="primary">
          Sign in
        </button>
      </form>
    </main>
  );
}
