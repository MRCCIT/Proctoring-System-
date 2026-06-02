'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface SdkCredentials {
  api_key_prefix?: string;
  tenant?: { id: string; slug: string; name: string; status: string };
  integration_status?: string;
  sdk_version?: string;
  sdk_install_snippet?: { npm: string; usage: string; api_base: string };
}

export default function SettingsPage() {
  const [creds, setCreds] = useState<SdkCredentials | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await getClient().getSdkCredentials();
      setCreds(r.data as SdkCredentials);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rotate = async () => {
    if (!confirm('Rotate API key? Old key will stop working immediately.')) return;
    setBusy(true);
    setErr('');
    try {
      const r = await getClient().rotateSdkKey();
      setRotatedKey((r.data as { api_key: string }).api_key);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>SDK credentials & integration</h1>
        <p className="muted">Tenant API key for the candidate SDK. Rotate carefully.</p>
        {err && <p className="error">{err}</p>}
        {creds ? (
          <>
            <Card>
              <p>
                <strong>Tenant:</strong> {creds.tenant?.name} <code>{creds.tenant?.slug}</code> ·{' '}
                <span style={{ color: '#16a34a' }}>{creds.tenant?.status}</span>
              </p>
              <p>
                <strong>API key prefix:</strong> <code>{creds.api_key_prefix}</code>…
              </p>
              <p>
                <strong>SDK version:</strong> {creds.sdk_version || 'n/a'}
              </p>
              <button type="button" className="primary" disabled={busy} onClick={() => void rotate()}>
                {busy ? 'Rotating…' : 'Rotate API key'}
              </button>
            </Card>

            {rotatedKey && (
              <Card>
                <h3 style={{ marginTop: 0, color: '#b91c1c' }}>New API key — copy now, it won&apos;t be shown again</h3>
                <pre className="json">{rotatedKey}</pre>
              </Card>
            )}

            <Card>
              <h3 style={{ marginTop: 0 }}>SDK integration</h3>
              <p style={{ fontSize: 14 }}>Install:</p>
              <pre className="json">npm install {creds.sdk_install_snippet?.npm}</pre>
              <p style={{ fontSize: 14 }}>Drop-in candidate exam window:</p>
              <pre className="json">{`import { ExamWindow } from '@proctorshield/sdk/exam-window';

<ExamWindow
  apiKey="${creds.api_key_prefix}…"
  baseUrl="${creds.sdk_install_snippet?.api_base}"
  examUrl="https://your-lms.example.com/exam/abc"
/>`}</pre>
              <p style={{ fontSize: 14 }}>That single component handles permissions, identity verification, lockdown,
              face-check Web Worker, screen + camera chunked recording, proctor chat, and live status indicators.</p>
            </Card>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
