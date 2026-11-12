'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  TablePagination,
  Td,
  useClientPagination,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface PolicyTemplate {
  id: string;
  name: string;
  description: string | null;
  ai_sensitivity: string;
  ai_modules: Record<string, boolean>;
  grace_period_seconds: number;
  severity_thresholds: Record<string, number>;
  whitelist: string[];
  is_default: boolean;
  exam_count?: number;
  created_at: string;
}

const MODULE_KEYS = [
  'face_detection',
  'multiple_faces',
  'gaze_tracking',
  'object_detection',
  'audio_voice',
  'audio_noise',
  'keystroke',
  'network',
];

export default function PoliciesPage() {
  const [items, setItems] = useState<PolicyTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<PolicyTemplate> | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    setErr('');
    try {
      const r = await getClient().listPolicyTemplates();
      setItems((r.data as PolicyTemplate[]) || []);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!editing) return;
    setErr('');
    if (!String(editing.name || '').trim()) {
      setErr('Enter a policy name before saving.');
      return;
    }
    try {
      const body = {
        name: editing.name,
        description: editing.description,
        ai_sensitivity: editing.ai_sensitivity,
        ai_modules: editing.ai_modules,
        grace_period_seconds: editing.grace_period_seconds,
        severity_thresholds: editing.severity_thresholds,
        whitelist: editing.whitelist,
        is_default: editing.is_default,
      };
      if (editing.id) await getClient().updatePolicyTemplate(editing.id, body as Record<string, unknown>);
      else await getClient().createPolicyTemplate(body as Record<string, unknown>);
      setEditing(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete policy template?')) return;
    await getClient().deletePolicyTemplate(id);
    await load();
  };

  const startNew = () => {
    setEditing({
      name: '',
      description: '',
      ai_sensitivity: 'normal',
      ai_modules: Object.fromEntries(MODULE_KEYS.map((k) => [k, true])),
      grace_period_seconds: 5,
      severity_thresholds: { warn: 1, flag: 3, terminate: 8 },
      whitelist: [],
      is_default: false,
    });
  };

  const pager = useClientPagination(items, 10);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Proctoring policies"
          description="Reusable proctoring rules — AI modules, thresholds, allow-lists and sensitivity."
          breadcrumbs={[{ label: 'Advanced' }, { label: 'Policies' }]}
        />
        {err && <Alert tone="danger">{err}</Alert>}
        <div style={{ marginBottom: 12 }}>
          <Button variant="primary" onClick={startNew}>
            New policy template
          </Button>
        </div>
        <DataTable
          headers={['Name', 'Sensitivity', 'Modules', 'Default', 'Used by', '']}
          isEmpty={!pager.pageItems.length}
          empty={
            <EmptyState
              icon="shield"
              title="No policies yet"
              description="Starter Standard and Strict policies are created automatically on first open. Refresh if the list is empty."
            />
          }
        >
          {pager.pageItems.map((p) => (
            <tr key={p.id}>
              <Td>
                <strong>{p.name}</strong>
                {p.description && <div style={{ color: '#64748b', fontSize: 12 }}>{p.description}</div>}
              </Td>
              <Td>{p.ai_sensitivity}</Td>
              <Td>{Object.entries(p.ai_modules || {}).filter(([, v]) => v).map(([k]) => k).join(', ')}</Td>
              <Td>{p.is_default ? 'Yes' : '—'}</Td>
              <Td>{p.exam_count ?? 0} exam{(p.exam_count ?? 0) === 1 ? '' : 's'}</Td>
              <Td>
                <button type="button" onClick={() => setEditing(p)} style={{ marginRight: 6 }}>
                  Edit
                </button>
                <button type="button" onClick={() => void remove(p.id)} style={{ background: '#fee2e2' }}>
                  Delete
                </button>
              </Td>
            </tr>
          ))}
        </DataTable>
        <TablePagination
          page={pager.page}
          pageSize={pager.pageSize}
          total={pager.total}
          pageCount={pager.pageCount}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
        />

        {editing && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setEditing(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#fff', padding: 20, borderRadius: 12, width: 'min(640px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}
            >
              <h2 style={{ marginTop: 0 }}>{editing.id ? 'Edit policy' : 'New policy'}</h2>
              <Card>
                <label>
                  Name
                  <input
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </label>
                <label style={{ display: 'block', marginTop: 8 }}>
                  Description
                  <textarea
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    rows={2}
                    style={{ width: '100%' }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                  <label>
                    AI sensitivity
                    <select
                      value={editing.ai_sensitivity || 'normal'}
                      onChange={(e) => setEditing({ ...editing, ai_sensitivity: e.target.value })}
                    >
                      <option value="low">low</option>
                      <option value="normal">normal</option>
                      <option value="high">high</option>
                    </select>
                  </label>
                  <label>
                    Grace period (s)
                    <input
                      type="number"
                      min={0}
                      value={editing.grace_period_seconds ?? 5}
                      onChange={(e) => setEditing({ ...editing, grace_period_seconds: parseInt(e.target.value, 10) || 0 })}
                    />
                  </label>
                  <label>
                    Default
                    <input
                      type="checkbox"
                      checked={editing.is_default || false}
                      onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })}
                    />
                  </label>
                </div>

                <h3>AI modules</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                  {MODULE_KEYS.map((k) => (
                    <label key={k} style={{ fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={editing.ai_modules?.[k] || false}
                        onChange={(e) =>
                          setEditing({ ...editing, ai_modules: { ...(editing.ai_modules || {}), [k]: e.target.checked } })
                        }
                      />{' '}
                      {k}
                    </label>
                  ))}
                </div>

                <h3>Severity thresholds (violations count → action)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {(['warn', 'flag', 'terminate'] as const).map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        value={editing.severity_thresholds?.[k] ?? 0}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            severity_thresholds: { ...(editing.severity_thresholds || {}), [k]: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>

                <h3>Whitelist (comma-separated)</h3>
                <input
                  value={(editing.whitelist || []).join(',')}
                  onChange={(e) => setEditing({ ...editing, whitelist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  style={{ width: '100%' }}
                />
              </Card>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" className="primary" onClick={() => void save()}>Save</button>
              </div>
            </div>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
