'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  StatusBadge,
  Td,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';
import { api } from '@/lib/tenantApi';

interface ProctorRow {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  max_candidate_capacity: number;
  current_assigned: number;
  available_capacity: number;
  active_exam_count: number;
  last_active_at?: string | null;
  invited_at?: string | null;
  invite_url?: string;
}

function statusLabel(s: string) {
  if (s === 'pending') return 'Invited';
  if (s === 'disabled') return 'Disabled';
  return 'Active';
}

export default function UsersPage() {
  const [items, setItems] = useState<ProctorRow[]>([]);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ display_name: '', email: '', max_candidate_capacity: '20' });
  const [edit, setEdit] = useState<ProctorRow | null>(null);

  const load = async () => {
    setErr('');
    try {
      const r = await api<{ data: ProctorRow[] }>('GET', '/v1/tenant/proctoring/proctors');
      setItems(r.data || []);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setToast('');
    try {
      const r = await api<{ data: ProctorRow & { invite_url?: string } }>('POST', '/v1/tenant/proctoring/proctors/invite', {
        display_name: form.display_name.trim() || undefined,
        email: form.email.trim(),
        max_candidate_capacity: parseInt(form.max_candidate_capacity, 10) || 20,
      });
      setForm({ display_name: '', email: '', max_candidate_capacity: '20' });
      setToast(r.data.invite_url ? `Invite created. Link: ${r.data.invite_url}` : 'Invite sent.');
      await load();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    setErr('');
    try {
      await getClient().updateTenantUser(edit.id, {
        display_name: edit.display_name,
        max_candidate_capacity: Number(edit.max_candidate_capacity),
      } as Record<string, unknown>);
      setEdit(null);
      await load();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await getClient().updateTenantUser(id, { status } as Record<string, unknown>);
      await load();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Proctors"
          description="Invite monitoring staff, set candidate capacity, and track workload. They set their own password via invite link."
          breadcrumbs={[{ label: 'Advanced' }, { label: 'Team' }]}
        />
        {err && <Alert tone="danger">{err}</Alert>}
        {toast && <Alert tone="success">{toast}</Alert>}

        <Card title="Invite proctor" description="No password from admin — invite email / link sets credentials.">
          <form onSubmit={invite} className="ps-grid-2" style={{ gap: 12 }}>
            <Field label="Name">
              <input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Proctor name"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="proctor@org.edu"
              />
            </Field>
            <Field label="Max candidate capacity" required>
              <input
                type="number"
                min={1}
                required
                value={form.max_candidate_capacity}
                onChange={(e) => setForm({ ...form, max_candidate_capacity: e.target.value })}
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <Button type="submit" variant="primary" loading={busy}>
                Send invite
              </Button>
            </div>
          </form>
        </Card>

        <div style={{ marginTop: 16 }}>
          <DataTable
            headers={['Proctor', 'Status', 'Capacity', 'Assigned', 'Available', 'Exams', 'Last active', '']}
            isEmpty={!items.length}
            empty={<EmptyState icon="users" title="No proctors yet" description="Invite your first monitoring proctor." />}
          >
            {items.map((p) => (
              <tr key={p.id}>
                <Td>
                  <strong>{p.display_name || '—'}</strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{p.email}</div>
                </Td>
                <Td>
                  <StatusBadge status={p.status} label={statusLabel(p.status)} />
                </Td>
                <Td>{p.max_candidate_capacity}</Td>
                <Td>{p.current_assigned}</Td>
                <Td>
                  <Badge tone={p.available_capacity > 0 ? 'success' : 'warning'}>{p.available_capacity}</Badge>
                </Td>
                <Td>{p.active_exam_count}</Td>
                <Td muted nowrap>
                  {p.last_active_at ? new Date(p.last_active_at).toLocaleString() : '—'}
                </Td>
                <Td>
                  <div className="ps-inline" style={{ gap: 6 }}>
                    <Button onClick={() => setEdit({ ...p, status: p.status })}>Edit</Button>
                    {p.status === 'active' ? (
                      <Button variant="danger" onClick={() => void setStatus(p.id, 'disabled')}>
                        Disable
                      </Button>
                    ) : p.status === 'disabled' ? (
                      <Button variant="success" onClick={() => void setStatus(p.id, 'active')}>
                        Activate
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </DataTable>
        </div>

        {edit && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.5)',
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setEdit(null)}
          >
            <div
              style={{ background: '#fff', padding: 20, borderRadius: 12, width: 'min(420px, 92vw)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0 }}>Edit proctor</h3>
              <Field label="Name">
                <input
                  value={edit.display_name || ''}
                  onChange={(e) => setEdit({ ...edit, display_name: e.target.value })}
                />
              </Field>
              <Field label="Max capacity">
                <input
                  type="number"
                  min={1}
                  value={edit.max_candidate_capacity}
                  onChange={(e) => setEdit({ ...edit, max_candidate_capacity: parseInt(e.target.value, 10) || 1 })}
                />
              </Field>
              <div className="ps-inline" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <Button onClick={() => setEdit(null)}>Cancel</Button>
                <Button variant="primary" loading={busy} onClick={() => void saveEdit()}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
