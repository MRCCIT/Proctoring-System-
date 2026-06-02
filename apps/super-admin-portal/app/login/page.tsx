'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getClient, superAdminTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('superadmin@proctorshield.local');
  const [password, setPassword] = useState('ChangeMe!123');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await getClient().superadminLogin(email, password);
      superAdminTokens.set(res.access_token);
      router.push('/dashboard');
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <main style={{ padding: 48, maxWidth: 420, margin: '0 auto' }}>
      <h1>Super Admin</h1>
      <p className="muted">POST /v1/superadmin/auth/login</p>
      <form onSubmit={submit}>
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
