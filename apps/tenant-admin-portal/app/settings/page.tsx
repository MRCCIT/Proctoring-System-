'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  KeyValue,
  PageHeader,
  StatusBadge,
} from '@proctorshield/ui-components';
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

  const prefix = creds?.api_key_prefix || 'psk_live_…';
  const apiBase = creds?.sdk_install_snippet?.api_base || 'http://localhost:3001';
  const npmPkg = creds?.sdk_install_snippet?.npm || '@proctorshield/sdk';
  const installCmd = `npm install ${npmPkg}`;
  const usageSnippet = `import { ExamWindow } from '@proctorshield/sdk/exam-window';

<ExamWindow
  apiKey="${prefix}…"
  baseUrl="${apiBase}"
  examUrl="https://your-lms.example.com/exam/abc"
/>`;

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="SDK credentials & integration"
          description="Tenant API key for the candidate exam SDK. Rotate only when you need to revoke the old key."
        />
        {err && <Alert tone="danger">{err}</Alert>}

        {!creds ? (
          <p className="ps-muted">Loading credentials…</p>
        ) : (
          <div className="ps-settings-stack">
            <Card title="Credentials" description="Shown prefix is safe to display — the full secret appears only after rotate.">
              <div className="ps-settings-tenant">
                <div>
                  <div className="ps-settings-tenant-name">{creds.tenant?.name || '—'}</div>
                  <div className="ps-settings-tenant-meta">
                    <Badge tone="neutral">{creds.tenant?.slug || '—'}</Badge>
                    <StatusBadge status={creds.tenant?.status} />
                  </div>
                </div>
                <Button variant="primary" loading={busy} onClick={() => void rotate()}>
                  Rotate API key
                </Button>
              </div>

              <KeyValue
                items={[
                  {
                    label: 'API key prefix',
                    value: (
                      <span className="ps-settings-key">
                        <code>{prefix}…</code>
                        <CopyButton value={prefix} label="Copy prefix" />
                      </span>
                    ),
                  },
                  { label: 'SDK version', value: creds.sdk_version || 'Not reported' },
                  { label: 'API base URL', value: <code className="ps-settings-inline-code">{apiBase}</code> },
                ]}
              />
            </Card>

            {rotatedKey && (
              <Card title="New API key" description="Copy now — this full secret will not be shown again.">
                <Alert tone="warning" title="Store this securely">
                  Update your LMS / exam app with the new key before candidates start sessions.
                </Alert>
                <div className="ps-settings-code-block">
                  <div className="ps-settings-code-head">
                    <span>Full API key</span>
                    <CopyButton value={rotatedKey} label="Copy key" />
                  </div>
                  <pre className="ps-code">{rotatedKey}</pre>
                </div>
              </Card>
            )}

            <Card title="SDK integration" description="Install the package, then drop ExamWindow into your candidate exam page.">
              <div className="ps-settings-code-block">
                <div className="ps-settings-code-head">
                  <span>Install</span>
                  <CopyButton value={installCmd} label="Copy" />
                </div>
                <pre className="ps-code">{installCmd}</pre>
              </div>

              <div className="ps-settings-code-block" style={{ marginTop: 14 }}>
                <div className="ps-settings-code-head">
                  <span>Drop-in exam window</span>
                  <CopyButton value={usageSnippet} label="Copy" />
                </div>
                <pre className="ps-code">{usageSnippet}</pre>
              </div>

              <p className="ps-settings-footnote">
                Handles permissions, identity verification, lockdown, face-check worker, screen + camera recording,
                proctor chat, and live status — replace <code>apiKey</code> with your full secret after rotate.
              </p>
            </Card>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
