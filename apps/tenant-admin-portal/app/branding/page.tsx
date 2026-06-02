'use client';

import { useEffect, useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface Branding {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  organization_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  candidate_welcome_message: string | null;
  tenant_slug?: string;
  tenant_name?: string;
}

export default function BrandingPage() {
  const [b, setB] = useState<Branding | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await getClient().getBranding();
      setB(r.data as Branding);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!b) return;
    setBusy(true);
    setErr('');
    setSaved(false);
    try {
      const r = await getClient().putBranding(b as unknown as Record<string, unknown>);
      setB(r.data as Branding);
      setSaved(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Branding</h1>
        <p className="muted">
          GET/PUT /v1/tenant/branding · embedded automatically in the candidate SDK at /v1/sdk/branding
        </p>
        {err && <p className="error">{err}</p>}
        {!b ? (
          <p className="muted">Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Card>
              <label>
                Organization name
                <input
                  value={b.organization_name || ''}
                  onChange={(e) => setB({ ...b, organization_name: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ marginTop: 12, display: 'block' }}>
                Logo URL (https://… or data URL)
                <input
                  value={b.logo_url || ''}
                  onChange={(e) => setB({ ...b, logo_url: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                <label>
                  Primary color
                  <input type="color" value={b.primary_color} onChange={(e) => setB({ ...b, primary_color: e.target.value })} />
                </label>
                <label>
                  Secondary color
                  <input type="color" value={b.secondary_color} onChange={(e) => setB({ ...b, secondary_color: e.target.value })} />
                </label>
                <label>
                  Accent color
                  <input type="color" value={b.accent_color} onChange={(e) => setB({ ...b, accent_color: e.target.value })} />
                </label>
              </div>
              <label style={{ marginTop: 12, display: 'block' }}>
                Support email
                <input
                  value={b.support_email || ''}
                  onChange={(e) => setB({ ...b, support_email: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ marginTop: 12, display: 'block' }}>
                Support phone
                <input
                  value={b.support_phone || ''}
                  onChange={(e) => setB({ ...b, support_phone: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ marginTop: 12, display: 'block' }}>
                Candidate welcome message
                <textarea
                  value={b.candidate_welcome_message || ''}
                  onChange={(e) => setB({ ...b, candidate_welcome_message: e.target.value })}
                  rows={3}
                  style={{ width: '100%' }}
                />
              </label>
              <button type="button" className="primary" disabled={busy} onClick={() => void save()} style={{ marginTop: 12 }}>
                {busy ? 'Saving…' : 'Save branding'}
              </button>
              {saved && <span style={{ color: '#16a34a', marginLeft: 12 }}>Saved.</span>}
            </Card>
            <Card>
              <h3 style={{ marginTop: 0 }}>Preview</h3>
              <div style={{ border: `2px solid ${b.primary_color}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {b.logo_url && <img src={b.logo_url} alt="logo" style={{ height: 28 }} />}
                  <strong style={{ color: b.primary_color }}>{b.organization_name || b.tenant_name}</strong>
                </div>
                <p style={{ fontSize: 13, color: '#475569' }}>{b.candidate_welcome_message || '(welcome message preview)'}</p>
                <button
                  type="button"
                  style={{
                    background: b.primary_color,
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 6,
                  }}
                >
                  Continue
                </button>
                <span
                  style={{
                    marginLeft: 8,
                    background: b.accent_color,
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: 999,
                    fontSize: 12,
                  }}
                >
                  REC
                </span>
              </div>
            </Card>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
