'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Field, PageHeader, SearchInput, Toolbar } from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { UtilizationMeter } from '@/components/infra/charts';

function TenantControlsInner() {
  const sp = useSearchParams();
  const [tenants, setTenants] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [tenantId, setTenantId] = useState(sp.get('tenant') || '');
  const [usage, setUsage] = useState<any>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getClient()
      .getInfrastructureTenants()
      .then((r) => setTenants((r.data as any[]) || []))
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    setBusy(true);
    getClient()
      .getInfrastructureTenant(tenantId)
      .then((r) => {
        setUsage(r.data);
        setDraft({ ...(r.data as any).policies });
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  }, [tenantId]);

  const filtered = tenants.filter(
    (t) => !q || t.name?.toLowerCase().includes(q.toLowerCase()) || t.slug?.toLowerCase().includes(q.toLowerCase())
  );

  const save = async () => {
    if (!tenantId) return;
    setBusy(true);
    setErr('');
    try {
      await getClient().updateInfrastructureTenantPolicies(tenantId, { policies: draft, reason: 'tenant_controls_ui' });
      setToast('Tenant policies saved');
      const r = await getClient().getInfrastructureTenant(tenantId);
      setUsage(r.data);
      setDraft({ ...(r.data as any).policies });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Tenant Controls"
        description="Per-tenant quotas, AI features and priority. Usage shown beside each limit."
        actions={
          <Button variant="primary" loading={busy} disabled={!tenantId} onClick={save}>
            Save tenant policy
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      {toast && <Alert tone="success">{toast}</Alert>}

      <Card>
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Filter tenants" />
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Select tenant">
            <option value="">Select tenant…</option>
            {filtered.map((t) => (
              <option key={t.tenant_id} value={t.tenant_id}>
                {t.name}
              </option>
            ))}
          </select>
        </Toolbar>
      </Card>

      {usage && (
        <>
          <div className="ps-stats" style={{ marginTop: 16 }}>
            {(usage.services || []).slice(0, 5).map((s: any) => (
              <UtilizationMeter
                key={s.service}
                label={s.service.replace(/_/g, ' ')}
                value={typeof s.current === 'number' ? s.current : null}
                max={typeof s.quota === 'number' ? s.quota : null}
                unit={s.unit}
                hint={s.hint}
                attribution={s.attribution}
                valueKind={s.value_kind === 'bytes' || s.service === 'media' ? 'bytes' : 'number'}
              />
            ))}
          </div>
          <div className="ps-grid-2" style={{ marginTop: 16 }}>
            <Card title="Quotas">
              <Field label="Max concurrent sessions">
                <input type="number" value={draft.max_concurrent_sessions ?? ''} onChange={(e) => setDraft((p) => ({ ...p, max_concurrent_sessions: Number(e.target.value) }))} />
              </Field>
              <Field label="Storage MB">
                <input type="number" value={draft.storage_mb ?? ''} onChange={(e) => setDraft((p) => ({ ...p, storage_mb: Number(e.target.value) }))} />
              </Field>
              <Field label="API requests / minute">
                <input type="number" value={draft.api_requests_per_minute ?? ''} onChange={(e) => setDraft((p) => ({ ...p, api_requests_per_minute: Number(e.target.value) }))} />
              </Field>
              <Field label="WebSocket connections">
                <input type="number" value={draft.max_websocket_connections ?? ''} onChange={(e) => setDraft((p) => ({ ...p, max_websocket_connections: Number(e.target.value) }))} />
              </Field>
              <Field label="Daily egress MB">
                <input type="number" value={draft.daily_egress_mb ?? ''} onChange={(e) => setDraft((p) => ({ ...p, daily_egress_mb: Number(e.target.value) }))} />
              </Field>
              <Field label="AI concurrency">
                <input type="number" value={draft.ai_concurrency ?? ''} onChange={(e) => setDraft((p) => ({ ...p, ai_concurrency: Number(e.target.value) }))} />
              </Field>
              <Field label="Priority">
                <select value={draft.priority || 'normal'} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value }))}>
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </Field>
            </Card>
            <Card title="AI features">
              {Object.entries(draft.ai_features || {}).map(([k, v]) => (
                <label key={k} className="ps-check" style={{ marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(v)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        ai_features: { ...(p.ai_features || {}), [k]: e.target.checked },
                      }))
                    }
                  />
                  {k}
                </label>
              ))}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export default function TenantControlsPage() {
  return (
    <Suspense fallback={<p className="ps-muted">Loading…</p>}>
      <TenantControlsInner />
    </Suspense>
  );
}
