'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
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

const SDK_FEATURES = [
  'Camera, mic & screen permissions',
  'Identity check',
  'Browser lockdown',
  'Face & phone detection',
  'Screen + camera recording',
  'Proctor chat',
  'Live status',
];

export default function SettingsPage() {
  const [creds, setCreds] = useState<SdkCredentials | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [contentMode, setContentMode] = useState<'url' | 'children'>('url');

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
  const keyValue = rotatedKey || 'YOUR_FULL_API_KEY';
  const requiredProps = `      baseUrl="${apiBase}"
      apiKey="${keyValue}"`;
  const optionalProps = `      candidateName="Jane Doe"
      examTitle="Physics mid-term"
      onSessionEnd={(sessionId) => console.log('Session ended', sessionId)}`;
  const usageSnippet =
    contentMode === 'url'
      ? `import { ExamWindow } from '@proctorshield/sdk/exam-window';

export default function ProctoredExam() {
  return (
    <ExamWindow
${requiredProps}
      examUrl="https://your-lms.example.com/exam/abc"
${optionalProps}
    />
  );
}`
      : `import { ExamWindow } from '@proctorshield/sdk/exam-window';
import { ExamPaper } from './ExamPaper';

export default function ProctoredExam() {
  return (
    <ExamWindow
${requiredProps}
${optionalProps}
    >
      <ExamPaper />
    </ExamWindow>
  );
}`;

  const propRows: { name: string; required?: boolean; example: string; meaning: ReactNode }[] = [
    {
      name: 'baseUrl',
      required: true,
      example: apiBase,
      meaning: (
        <>
          The ProctorShield API address. Use exactly this value. It is <strong>not</strong> your website or LMS.
        </>
      ),
    },
    {
      name: 'apiKey',
      required: true,
      example: `${prefix}…`,
      meaning: (
        <>
          Your organization&apos;s full secret key. Only the prefix is shown here; the full key appears once, right
          after you click <strong>Rotate API key</strong>.
        </>
      ),
    },
    {
      name: contentMode === 'url' ? 'examUrl' : 'children',
      example: contentMode === 'url' ? 'https://your-lms…/exam/abc' : '<ExamPaper />',
      meaning:
        contentMode === 'url' ? (
          <>
            The page with your questions, on <strong>your</strong> site. It loads inside the proctored window, so it
            must allow being embedded in an iframe.
          </>
        ) : (
          <>Your own question UI, rendered inside the proctored window instead of an iframe.</>
        ),
    },
    {
      name: 'candidateName / examTitle',
      example: 'Jane Doe · Physics mid-term',
      meaning: <>Shown to the candidate, and used to label the session on the Sessions and Live monitoring pages.</>,
    },
    {
      name: 'onSessionEnd',
      example: '(sessionId) => …',
      meaning: <>Runs when the candidate finishes. Use it to redirect them or save the session ID with their result.</>,
    },
  ];

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
                  {
                    label: 'API base URL',
                    value: (
                      <span className="ps-settings-key">
                        <code>{apiBase}</code>
                        <CopyButton value={apiBase} label="Copy URL" />
                      </span>
                    ),
                  },
                  {
                    label: 'SDK version',
                    value: creds.sdk_version || <span className="ps-muted">Appears after your first SDK session</span>,
                  },
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

            <Card
              title="SDK integration"
              description="Add proctoring to your exam page in a few minutes. The SDK wraps your exam and handles everything else."
            >
              <ol className="ps-sdk-steps">
                <li className="ps-sdk-step">
                  <div className="ps-sdk-step-head">
                    <span className="ps-sdk-step-num">1</span>
                    <div>
                      <h3>Install the package</h3>
                      <p>Run this in the project that serves your candidate exam page.</p>
                    </div>
                  </div>
                  <div className="ps-settings-code-block">
                    <div className="ps-settings-code-head">
                      <span>Terminal</span>
                      <CopyButton value={installCmd} label="Copy" />
                    </div>
                    <pre className="ps-code">{installCmd}</pre>
                  </div>
                </li>

                <li className="ps-sdk-step">
                  <div className="ps-sdk-step-head">
                    <span className="ps-sdk-step-num">2</span>
                    <div>
                      <h3>Wrap your exam with ExamWindow</h3>
                      <p>Choose how your questions are shown to the candidate.</p>
                    </div>
                  </div>
                  <div className="ps-sdk-toggle" role="tablist" aria-label="Exam content">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={contentMode === 'url'}
                      className={contentMode === 'url' ? 'is-active' : ''}
                      onClick={() => setContentMode('url')}
                    >
                      Exam is a page on my site
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={contentMode === 'children'}
                      className={contentMode === 'children' ? 'is-active' : ''}
                      onClick={() => setContentMode('children')}
                    >
                      I render my own React UI
                    </button>
                  </div>
                  <div className="ps-settings-code-block">
                    <div className="ps-settings-code-head">
                      <span className="ps-settings-code-file">ProctoredExam.tsx</span>
                      <CopyButton value={usageSnippet} label="Copy code" />
                    </div>
                    <pre className="ps-code">{usageSnippet}</pre>
                  </div>
                  {rotatedKey ? (
                    <p className="ps-settings-footnote">Your new API key is already filled in above.</p>
                  ) : (
                    <p className="ps-settings-footnote">
                      Replace <code>YOUR_FULL_API_KEY</code> with your full key (it starts with <code>{prefix}</code>).
                      Lost it? Click <strong>Rotate API key</strong> above to get a new one.
                    </p>
                  )}
                </li>

                <li className="ps-sdk-step">
                  <div className="ps-sdk-step-head">
                    <span className="ps-sdk-step-num">3</span>
                    <div>
                      <h3>What each setting means</h3>
                      <p>Only the first two are required.</p>
                    </div>
                  </div>
                  <div className="ps-sdk-props">
                    {propRows.map((row) => (
                      <div className="ps-sdk-prop" key={row.name}>
                        <div className="ps-sdk-prop-name">
                          <code>{row.name}</code>
                          {row.required ? <Badge tone="info">Required</Badge> : <Badge tone="neutral">Optional</Badge>}
                        </div>
                        <div className="ps-sdk-prop-body">
                          <p>{row.meaning}</p>
                          <span className="ps-sdk-prop-example">e.g. {row.example}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </li>

                <li className="ps-sdk-step">
                  <div className="ps-sdk-step-head">
                    <span className="ps-sdk-step-num">4</span>
                    <div>
                      <h3>Check it works</h3>
                      <p>
                        Open your exam page and start a test attempt. Within a few seconds it appears in{' '}
                        <Link href="/live">Live monitoring</Link>, and afterwards in <Link href="/sessions">Sessions</Link>{' '}
                        with its recording and alerts.
                      </p>
                    </div>
                  </div>
                </li>
              </ol>

              <div className="ps-sdk-features">
                <span className="ps-sdk-features-title">Handled for you</span>
                <ul>
                  {SDK_FEATURES.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>

              <Alert tone="warning" title="Keep the key off public pages in production">
                Anyone who can view your page source can read <code>apiKey</code>. In production, create the session on
                your server and pass it to <code>ExamWindow</code> with the <code>session</code> prop instead.
              </Alert>
            </Card>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
