'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

export default function NewTenantPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [contact_email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await getClient().createTenant({ name, slug, contact_email });
      setApiKey(res.api_key);
      setTimeout(() => router.push(`/tenants/${res.data.id}`), 2000);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <AuthGuard>
      <SuperAdminShell>
        <h1>Create tenant</h1>
        <p className="muted">POST /v1/superadmin/tenants</p>
        <Card>
          <form onSubmit={submit}>
            <p>
              <label>Name</label>
              <br />
              <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: '100%' }} />
            </p>
            <p>
              <label>Slug</label>
              <br />
              <input value={slug} onChange={(e) => setSlug(e.target.value)} required style={{ width: '100%' }} />
            </p>
            <p>
              <label>Contact email</label>
              <br />
              <input value={contact_email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
            </p>
            {err && <p className="error">{err}</p>}
            {apiKey && (
              <p>
                <strong>API key (save now):</strong>
                <br />
                <code>{apiKey}</code>
              </p>
            )}
            <button type="submit" className="primary">
              Create
            </button>
          </form>
        </Card>
      </SuperAdminShell>
    </AuthGuard>
  );
}
