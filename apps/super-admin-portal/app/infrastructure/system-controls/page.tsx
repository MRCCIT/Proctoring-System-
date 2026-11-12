'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Icon, Modal, PageHeader } from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';

function PolicyRevisionMeta({
  version,
  updatedAt,
  updatedBy,
  loadLevel,
  aiDeg,
}: {
  version?: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  loadLevel?: string;
  aiDeg?: number;
}) {
  if (version == null) return null;
  const editor = (updatedBy || '').trim();
  const level = String(loadLevel || 'L0').toUpperCase();
  const deg = Number(aiDeg ?? 0);
  const loadTone = level === 'L0' ? 'success' : level === 'L1' ? 'info' : level === 'L2' ? 'warning' : 'danger';
  const aiTone = deg >= 3 ? 'danger' : deg >= 2 ? 'warning' : deg >= 1 ? 'info' : 'success';

  return (
    <div className="ps-infra-status">
      <Badge tone="brand">Policy v{version}</Badge>
      <span className="ps-infra-status-updated" title={updatedAt ? formatDateTime(updatedAt) : undefined}>
        <Icon name="clock" size={13} />
        {updatedAt ? relativeTime(updatedAt) : 'Never saved'}
      </span>
      <Badge tone={editor ? 'neutral' : 'warning'}>
        {editor ? `By ${editor}` : 'Editor unknown (seed / migration)'}
      </Badge>
      <Badge tone={loadTone} dot>
        Load {level}
      </Badge>
      <Badge tone={aiTone} dot={deg > 0}>
        AI degrade {deg}/3
      </Badge>
    </div>
  );
}

export default function SystemControlsPage() {
  const [policies, setPolicies] = useState<Record<string, any> | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [meta, setMeta] = useState<{ version?: number; updated_at?: string; updated_by?: string }>({});
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = () => {
    getClient()
      .getInfrastructureGlobalPolicies()
      .then((r) => {
        const d = r.data as any;
        setPolicies(d.policies);
        setDraft({ ...d.policies });
        setMeta({ version: d.version, updated_at: d.updated_at, updated_by: d.updated_by });
      })
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  const setNum = (key: string, v: string) => setDraft((p) => ({ ...p, [key]: Number(v) }));

  const save = async () => {
    setBusy(true);
    setErr('');
    setToast('');
    try {
      const r = await getClient().updateInfrastructureGlobalPolicies({
        policies: draft,
        reason: 'system_controls_ui',
      });
      const d = r.data as any;
      setPolicies(d.policies);
      setDraft({ ...d.policies });
      setMeta({ version: d.version, updated_at: d.updated_at, updated_by: d.updated_by });
      setToast('Global policies saved');
      setConfirmOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    setBusy(true);
    try {
      await getClient().rollbackInfrastructureControls({ reason: 'ui_rollback' });
      setToast('Rolled back to previous policy');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="System Controls"
        description="Global capacity, load level and AI degradation. High-impact changes require confirmation."
        meta={
          <PolicyRevisionMeta
            version={meta.version}
            updatedAt={meta.updated_at}
            updatedBy={meta.updated_by}
            loadLevel={draft.load_level || policies?.load_level}
            aiDeg={draft.ai_degradation_level ?? policies?.ai_degradation_level}
          />
        }
        actions={
          <>
            <Button onClick={rollback} loading={busy}>
              Rollback
            </Button>
            <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={!policies}>
              Save changes
            </Button>
          </>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      {toast && <Alert tone="success">{toast}</Alert>}
      {!policies ? (
        <p className="ps-muted">Loading policies…</p>
      ) : (
        <div className="ps-grid-2">
          <Card title="Capacity">
            <Field label="Max global concurrent sessions">
              <input type="number" value={draft.max_global_concurrent_sessions ?? ''} onChange={(e) => setNum('max_global_concurrent_sessions', e.target.value)} />
            </Field>
            <Field label="Max API RPS">
              <input type="number" value={draft.max_api_rps ?? ''} onChange={(e) => setNum('max_api_rps', e.target.value)} />
            </Field>
            <Field label="Max WebSocket connections">
              <input type="number" value={draft.max_websocket_connections ?? ''} onChange={(e) => setNum('max_websocket_connections', e.target.value)} />
            </Field>
            <Field label="Max AI concurrency">
              <input type="number" value={draft.max_ai_concurrency ?? ''} onChange={(e) => setNum('max_ai_concurrency', e.target.value)} />
            </Field>
            <Field label="DB pool max">
              <input type="number" value={draft.db_pool_max ?? ''} onChange={(e) => setNum('db_pool_max', e.target.value)} />
            </Field>
          </Card>
          <Card title="Load & AI">
            <Field label="Load level">
              <select value={draft.load_level || 'L0'} onChange={(e) => setDraft((p) => ({ ...p, load_level: e.target.value }))}>
                {['L0', 'L1', 'L2', 'L3', 'L4'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <label className="ps-check">
              <input type="checkbox" checked={Boolean(draft.load_level_manual)} onChange={(e) => setDraft((p) => ({ ...p, load_level_manual: e.target.checked }))} />
              Manual load level override
            </label>
            <Field label="AI degradation (0–3)">
              <input type="number" min={0} max={3} value={draft.ai_degradation_level ?? 0} onChange={(e) => setNum('ai_degradation_level', e.target.value)} />
            </Field>
            <label className="ps-check">
              <input type="checkbox" checked={Boolean(draft.ai_degradation_manual)} onChange={(e) => setDraft((p) => ({ ...p, ai_degradation_manual: e.target.checked }))} />
              Manual AI degradation override
            </label>
            <Field label="Optimization mode">
              <select value={draft.optimization_mode || 'OBSERVE'} onChange={(e) => setDraft((p) => ({ ...p, optimization_mode: e.target.value }))}>
                <option value="OBSERVE">OBSERVE</option>
                <option value="ASSISTED">ASSISTED</option>
                <option value="ENFORCE">ENFORCE</option>
              </select>
            </Field>
          </Card>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Apply global policy changes?"
        description="This updates platform-wide capacity and may affect admission, load shedding and AI intensity."
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Confirm save
            </Button>
          </>
        }
      >
        <pre className="ps-code" style={{ maxHeight: 240 }}>
          {JSON.stringify(draft, null, 2)}
        </pre>
      </Modal>
    </>
  );
}
