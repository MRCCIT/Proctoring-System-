'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function WebhooksPage() {
  const [list, setList] = useState<unknown[]>([]);
  const [target_url, setUrl] = useState('https://example.com/hooks/proctorshield');
  const [created, setCreated] = useState<unknown>(null);
  const [err, setErr] = useState('');

  const load = () => {
    getClient()
      .listWebhooks()
      .then((r) => setList(r.data))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await getClient().createWebhook({
        target_url,
        events: ['session.started', 'session.ended'],
      });
      setCreated(res.data);
      load();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Webhooks</h1>
        <p className="muted">GET /v1/webhooks · POST /v1/webhooks</p>
        <Card title="Create webhook">
          <form onSubmit={add}>
            <input value={target_url} onChange={(e) => setUrl(e.target.value)} style={{ width: '100%' }} />
            <button type="submit" className="primary" style={{ marginTop: 8 }}>
              Add webhook
            </button>
          </form>
          {created && (
            <p>
              <strong>Signing secret (save once):</strong>{' '}
              <code>{String((created as { signing_secret?: string }).signing_secret)}</code>
            </p>
          )}
        </Card>
        {err && <p className="error">{err}</p>}
        <Card title="Configured webhooks">
          <pre className="json">{JSON.stringify(list, null, 2)}</pre>
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
