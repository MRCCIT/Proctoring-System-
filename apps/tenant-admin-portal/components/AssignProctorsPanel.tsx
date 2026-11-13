'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, SeverityBadge } from '@proctorshield/ui-components';
import { api } from '@/lib/tenantApi';

type Proctor = {
  id?: string;
  proctor_user_id?: string;
  email: string;
  display_name?: string | null;
  max_candidate_capacity: number;
  current_assigned: number;
  available_capacity: number;
  status?: string;
  user_status?: string;
};

type PoolData = {
  pool: Proctor[];
  eligible_count: number;
  risk_distribution: { critical: number; high: number; medium: number; low: number };
};

export function AssignProctorsPanel({ examId }: { examId: string }) {
  const [proctors, setProctors] = useState<Proctor[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'risk_based' | 'random'>('risk_based');
  const [poolInfo, setPoolInfo] = useState<PoolData | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<string>('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [plist, pool] = await Promise.all([
        api<{ data: Proctor[] }>('GET', '/v1/tenant/proctoring/proctors'),
        api<{ data: PoolData }>('GET', `/v1/tenant/proctoring/exams/${examId}/pool`),
      ]);
      setProctors((plist.data || []).filter((p) => p.status === 'active'));
      setPoolInfo(pool.data);
      const ids = (pool.data?.pool || []).map((p) => p.proctor_user_id || p.id!).filter(Boolean);
      if (ids.length) setSelected(ids as string[]);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPreview(null);
  };

  const run = async (dry: boolean) => {
    setBusy(true);
    setErr('');
    setResult('');
    try {
      const r = await api<{ data: { preview: Record<string, unknown>; assignments?: unknown[] } }>(
        'POST',
        `/v1/tenant/proctoring/exams/${examId}/allocate`,
        {
          proctor_user_ids: selected,
          mode,
          dry_run: dry,
          preview: dry,
          notify: !dry,
        }
      );
      setPreview(r.data.preview);
      if (!dry) {
        setResult(`Assigned ${r.data.preview.assigned ?? r.data.assignments?.length ?? 0} candidates.`);
        await load();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const capacity = proctors
    .filter((p) => selected.includes(p.id!))
    .reduce((s, p) => s + Number(p.available_capacity || 0), 0);

  return (
    <Card
      title="Assign proctors"
      description="Select active proctors, choose allocation mode, preview, then confirm. Only high-risk eligible sessions are distributed."
    >
      {err && <Alert tone="danger">{err}</Alert>}
      {result && <Alert tone="success">{result}</Alert>}

      <Field label="Allocation mode">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'risk_based' | 'random')}>
          <option value="risk_based">Dynamic risk-based</option>
          <option value="random">Random (capacity-aware)</option>
        </select>
      </Field>

      <div style={{ marginTop: 12 }}>
        <strong style={{ fontSize: 13 }}>Available proctors</strong>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {proctors.map((p) => {
            const id = p.id!;
            const on = selected.includes(id);
            return (
              <label
                key={id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '18px 1fr auto',
                  gap: 10,
                  padding: '10px 12px',
                  border: '1px solid var(--ps-border, #e2e8f0)',
                  borderRadius: 10,
                  background: on ? '#f0fdf4' : '#fff',
                }}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                <span>
                  <strong>{p.display_name || p.email}</strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{p.email}</div>
                </span>
                <span style={{ textAlign: 'right', fontSize: 12 }}>
                  <div>Max {p.max_candidate_capacity}</div>
                  <div>
                    Free <Badge tone={p.available_capacity > 0 ? 'success' : 'warning'}>{p.available_capacity}</Badge>
                  </div>
                </span>
              </label>
            );
          })}
          {!proctors.length && <p className="ps-muted">No active proctors. Invite them from Team.</p>}
        </div>
      </div>

      {poolInfo && (
        <div className="ps-row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ps-muted" style={{ fontSize: 13 }}>
            Eligible unassigned: <strong>{poolInfo.eligible_count}</strong>
          </span>
          <SeverityBadge severity="critical">Critical {poolInfo.risk_distribution.critical}</SeverityBadge>
          <SeverityBadge severity="high">High {poolInfo.risk_distribution.high}</SeverityBadge>
          <SeverityBadge severity="medium">Medium {poolInfo.risk_distribution.medium}</SeverityBadge>
          <span className="ps-muted" style={{ fontSize: 13 }}>
            Selected capacity <strong>{capacity}</strong>
          </span>
        </div>
      )}

      {preview && (
        <Alert tone="info" title="Allocation preview">
          Mode {String(preview.allocation_mode)} · Will assign {String(preview.will_assign)} of{' '}
          {String(preview.eligible_candidates)} eligible · Overflow {String(preview.unassigned_overflow)} · Critical{' '}
          {String(preview.critical)} / High {String(preview.high)}
        </Alert>
      )}

      <div className="ps-inline" style={{ marginTop: 14, gap: 8 }}>
        <Button loading={busy} disabled={!selected.length} onClick={() => void run(true)}>
          Preview
        </Button>
        <Button variant="primary" loading={busy} disabled={!selected.length} onClick={() => void run(false)}>
          Confirm &amp; allocate
        </Button>
      </div>
    </Card>
  );
}
