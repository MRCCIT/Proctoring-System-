'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Field,
  KeyValue,
  PageHeader,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { getClient } from '@/lib/api';

const AI_POLICY_FLAGS: { key: string; label: string; hint: string; defaultOn: boolean }[] = [
  { key: 'ai_face_detection', label: 'Face detection', hint: 'Presence / absence of candidate face', defaultOn: true },
  { key: 'multiple_faces', label: 'Multiple faces', hint: 'Flag extra people in frame', defaultOn: true },
  { key: 'gaze_detection', label: 'Gaze tracking', hint: 'Looking away / attention', defaultOn: true },
  { key: 'phone_detection', label: 'Phone detection', hint: 'Mobile device in view', defaultOn: true },
  { key: 'object_detection', label: 'Object detection', hint: 'Books, notes, secondary screens', defaultOn: true },
  { key: 'ai_audio_analysis', label: 'Audio analysis', hint: 'Voice / noise monitoring', defaultOn: false },
  { key: 'network_monitoring', label: 'Network monitoring', hint: 'Connectivity / tab signals', defaultOn: true },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function NewTenantPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [contact_email, setEmail] = useState('');
  const [contact_name, setContactName] = useState('');
  const [admin_email, setAdminEmail] = useState('');
  const [maxSessions, setMaxSessions] = useState('100');
  const [storageMb, setStorageMb] = useState('10240');
  const [flags, setFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(AI_POLICY_FLAGS.map((f) => [f.key, f.defaultOn]))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState<{
    id: string;
    name: string;
    slug: string;
    api_key: string;
    invite_url?: string | null;
  } | null>(null);

  const previewSlug = useMemo(() => (slugTouched ? slug : slugify(name)), [name, slug, slugTouched]);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await getClient().createTenant({
        name: name.trim(),
        slug: (slug || previewSlug).trim(),
        contact_email: contact_email.trim() || undefined,
        contact_name: contact_name.trim() || undefined,
        admin_email: admin_email.trim() || undefined,
        feature_flags: flags,
        quotas: {
          max_concurrent_sessions: parseInt(maxSessions, 10) || 100,
          storage_mb: parseInt(storageMb, 10) || 10240,
        },
      });
      setCreated({
        id: res.data.id,
        name: res.data.name,
        slug: res.data.slug,
        api_key: res.api_key,
        invite_url: res.invite_url,
      });
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthGuard>
      <SuperAdminShell>
        <PageHeader
          title="Create tenant"
          description="Provision an organization, choose which AI policies are allowed, and optionally invite a tenant admin."
          breadcrumbs={[{ href: '/tenants', label: 'Tenants' }, { label: 'New' }]}
          actions={
            <Button href="/tenants" icon="chevronLeft">
              Back to tenants
            </Button>
          }
        />

        {created ? (
          <div className="ps-grid-2">
            <Card title="Tenant created" description="Save the API key now — it will not be shown again.">
              <Alert tone="success" title="Organization ready">
                {created.name} ({created.slug}) is active with starter policies (Standard + Strict) and your selected AI
                features.
              </Alert>
              <KeyValue
                items={[
                  { label: 'Name', value: created.name },
                  { label: 'Slug', value: <code className="ps-mono">{created.slug}</code> },
                  {
                    label: 'API key',
                    value: (
                      <span className="ps-inline">
                        <code className="ps-mono" style={{ wordBreak: 'break-all' }}>
                          {created.api_key}
                        </code>
                        <CopyButton value={created.api_key} />
                      </span>
                    ),
                  },
                  ...(created.invite_url
                    ? [
                        {
                          label: 'Admin invite',
                          value: (
                            <span className="ps-inline">
                              <code className="ps-mono" style={{ wordBreak: 'break-all' }}>
                                {created.invite_url}
                              </code>
                              <CopyButton value={created.invite_url} />
                            </span>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              <div className="ps-inline" style={{ marginTop: 16 }}>
                <Button variant="primary" href={`/tenants/${created.id}`}>
                  Open tenant
                </Button>
                <Button href="/tenants">All tenants</Button>
              </div>
            </Card>
            <Card title="What was provisioned">
              <ul className="ps-link-list">
                <li>
                  <strong>AI feature flags</strong>
                  <span className="ps-muted">Only the modules you enabled are allowed for this tenant.</span>
                </li>
                <li>
                  <strong>Policy templates</strong>
                  <span className="ps-muted">Standard + Strict appear under Tenant Admin → Policies.</span>
                </li>
                <li>
                  <strong>Quotas</strong>
                  <span className="ps-muted">Concurrent sessions and storage limits applied.</span>
                </li>
              </ul>
            </Card>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="ps-grid-2">
              <Card title="Organization" description="Identity and admin invite.">
                <Field label="Organization name" required>
                  <input
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="Demo University"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Slug" hint="Used in login Organization ID and API routing" required>
                  <input
                    className="ps-mono"
                    value={slugTouched ? slug : previewSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugify(e.target.value) || e.target.value.toLowerCase());
                    }}
                    placeholder="demo-university"
                    required
                  />
                </Field>
                <Field label="Contact name">
                  <input value={contact_name} onChange={(e) => setContactName(e.target.value)} placeholder="Platform admin" />
                </Field>
                <Field label="Contact email">
                  <input
                    type="email"
                    value={contact_email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ops@university.edu"
                  />
                </Field>
                <Field label="Tenant admin email" hint="Optional — sends a set-password invite (no password from you).">
                  <input
                    type="email"
                    value={admin_email}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@university.edu"
                  />
                </Field>
              </Card>

              <Card title="Quotas" description="Capacity limits for this organization.">
                <Field label="Max concurrent sessions">
                  <input type="number" min={1} value={maxSessions} onChange={(e) => setMaxSessions(e.target.value)} />
                </Field>
                <Field label="Storage quota (MB)">
                  <input type="number" min={100} value={storageMb} onChange={(e) => setStorageMb(e.target.value)} />
                </Field>
                <p className="ps-muted" style={{ marginTop: 8, fontSize: 13 }}>
                  You can change these later from tenant detail or Infrastructure → Tenant Controls.
                </p>
              </Card>
            </div>

            <div style={{ marginTop: 16 }}>
              <Card
                title="AI policies allowed for this tenant"
                description="Turn off modules this organization must not use. Tenant admins still attach Standard/Strict exam policies within these limits."
              >
                <div className="ps-policy-flag-grid">
                  {AI_POLICY_FLAGS.map((f) => (
                    <label key={f.key} className={`ps-policy-flag${flags[f.key] ? ' is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(flags[f.key])}
                        onChange={(e) => setFlags((p) => ({ ...p, [f.key]: e.target.checked }))}
                      />
                      <span>
                        <strong>{f.label}</strong>
                        <small>{f.hint}</small>
                      </span>
                      <Badge tone={flags[f.key] ? 'success' : 'neutral'}>{flags[f.key] ? 'On' : 'Off'}</Badge>
                    </label>
                  ))}
                </div>
              </Card>
            </div>

            {err && (
              <div style={{ marginTop: 12 }}>
                <Alert tone="danger">{err}</Alert>
              </div>
            )}

            <div className="ps-inline" style={{ marginTop: 16 }}>
              <Button type="submit" variant="primary" icon="plus" loading={busy}>
                Create tenant
              </Button>
              <Button href="/tenants">Cancel</Button>
            </div>
          </form>
        )}
      </SuperAdminShell>
    </AuthGuard>
  );
}
