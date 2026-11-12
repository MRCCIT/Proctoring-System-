'use client';

import { useEffect, useState } from 'react';
import { Card, DataTable, PageHeader, TablePagination, Td, useClientPagination } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface SessionTemplate {
  id: string;
  name: string;
  description: string | null;
  default_duration_minutes: number;
  default_ai_sensitivity: string;
  default_ai_modules: Record<string, boolean>;
  default_policy_template_id: string | null;
}

interface PolicyTemplate {
  id: string;
  name: string;
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

export default function TemplatesPage() {
  const [items, setItems] = useState<SessionTemplate[]>([]);
  const [policies, setPolicies] = useState<PolicyTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<SessionTemplate> | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [tpls, pol] = await Promise.all([
        getClient().listSessionTemplates(),
        getClient().listPolicyTemplates(),
      ]);
      setItems(tpls.data as SessionTemplate[]);
      setPolicies(pol.data as PolicyTemplate[]);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!editing) return;
    const body = {
      name: editing.name,
      description: editing.description,
      default_duration_minutes: editing.default_duration_minutes,
      default_ai_sensitivity: editing.default_ai_sensitivity,
      default_ai_modules: editing.default_ai_modules,
      default_policy_template_id: editing.default_policy_template_id || null,
    };
    try {
      if (editing.id) await getClient().updateSessionTemplate(editing.id, body as Record<string, unknown>);
      else await getClient().createSessionTemplate(body as Record<string, unknown>);
      setEditing(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete session template?')) return;
    await getClient().deleteSessionTemplate(id);
    await load();
  };

  const pager = useClientPagination(items, 10);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Session templates"
          description="Reusable proctoring configurations for recurring exam types."
          breadcrumbs={[{ label: 'Advanced' }, { label: 'Session templates' }]}
        />
        {err && <p className="error">{err}</p>}
        <button
          type="button"
          className="primary"
          onClick={() =>
            setEditing({
              name: '',
              description: '',
              default_duration_minutes: 60,
              default_ai_sensitivity: 'normal',
              default_ai_modules: Object.fromEntries(MODULE_KEYS.map((k) => [k, k !== 'keystroke'])),
              default_policy_template_id: policies[0]?.id || null,
            })
          }
          style={{ marginBottom: 12 }}
        >
          New session template
        </button>
        <DataTable headers={['Name', 'Duration', 'Sensitivity', 'Policy', '']}>
          {pager.pageItems.map((t) => (
            <tr key={t.id}>
              <Td>
                <strong>{t.name}</strong>
                {t.description && <div style={{ color: '#64748b', fontSize: 12 }}>{t.description}</div>}
              </Td>
              <Td>{t.default_duration_minutes}min</Td>
              <Td>{t.default_ai_sensitivity}</Td>
              <Td>{policies.find((p) => p.id === t.default_policy_template_id)?.name || '—'}</Td>
              <Td>
                <button type="button" onClick={() => setEditing(t)} style={{ marginRight: 6 }}>
                  Edit
                </button>
                <button type="button" onClick={() => void remove(t.id)} style={{ background: '#fee2e2' }}>
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
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', padding: 20, borderRadius: 12, width: 'min(560px, 92vw)' }}>
              <h2 style={{ marginTop: 0 }}>{editing.id ? 'Edit template' : 'New template'}</h2>
              <Card>
                <label>
                  Name
                  <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} />
                </label>
                <label style={{ display: 'block', marginTop: 8 }}>
                  Description
                  <textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} style={{ width: '100%' }} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <label>
                    Duration (minutes)
                    <input type="number" min={1} value={editing.default_duration_minutes ?? 60} onChange={(e) => setEditing({ ...editing, default_duration_minutes: parseInt(e.target.value, 10) || 0 })} />
                  </label>
                  <label>
                    AI sensitivity
                    <select value={editing.default_ai_sensitivity || 'normal'} onChange={(e) => setEditing({ ...editing, default_ai_sensitivity: e.target.value })}>
                      <option>low</option>
                      <option>normal</option>
                      <option>high</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 12 }}>
                  Default policy template
                  <select
                    value={editing.default_policy_template_id || ''}
                    onChange={(e) => setEditing({ ...editing, default_policy_template_id: e.target.value || null })}
                  >
                    <option value="">— none —</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Default AI modules</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {MODULE_KEYS.map((k) => (
                      <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(editing.default_ai_modules?.[k])}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              default_ai_modules: {
                                ...(editing.default_ai_modules || {}),
                                [k]: e.target.checked,
                              },
                            })
                          }
                        />
                        {k.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </div>
              </Card>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="primary" onClick={() => void save()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
