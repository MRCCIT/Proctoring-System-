'use client';

import { useEffect, useState } from 'react';
import { Card, DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface TenantUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  permissions: Record<string, string[]>;
  created_at: string;
}

const RESOURCES = ['sessions', 'exams', 'candidates', 'branding', 'webhooks', 'sdk', 'users', 'reports', 'policies'];

export default function UsersPage() {
  const [items, setItems] = useState<TenantUser[]>([]);
  const [defaults, setDefaults] = useState<Record<string, Record<string, string[]>>>({});
  const [creating, setCreating] = useState({ email: '', password: '', display_name: '', role: 'sub_admin' });
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<TenantUser | null>(null);

  const load = async () => {
    try {
      const [users, dflt] = await Promise.all([
        getClient().listTenantUsers(),
        getClient().getTenantUserDefaults(),
      ]);
      setItems(users.data as TenantUser[]);
      setDefaults((dflt.data?.defaults as Record<string, Record<string, string[]>>) || {});
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await getClient().createTenantUser(creating as unknown as Record<string, unknown>);
      setCreating({ email: '', password: '', display_name: '', role: 'sub_admin' });
      await load();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try {
      await getClient().deleteTenantUser(id);
      await load();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  const toggleAction = (perms: Record<string, string[]>, resource: string, action: string) => {
    const next = { ...perms };
    const current = new Set(next[resource] || []);
    if (current.has(action)) current.delete(action);
    else current.add(action);
    next[resource] = [...current];
    return next;
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await getClient().updateTenantUser(editing.id, {
        display_name: editing.display_name,
        role: editing.role,
        permissions: editing.permissions,
      });
      setEditing(null);
      await load();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Sub-admins & proctors</h1>
        <p className="muted">
          Granular role-based permissions. POST /v1/tenant/users · PATCH /v1/tenant/users/:id
        </p>
        {err && <p className="error">{err}</p>}

        <Card>
          <h3 style={{ marginTop: 0 }}>Create new user</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <input
              placeholder="email"
              required
              value={creating.email}
              onChange={(e) => setCreating({ ...creating, email: e.target.value })}
            />
            <input
              placeholder="display name"
              value={creating.display_name}
              onChange={(e) => setCreating({ ...creating, display_name: e.target.value })}
            />
            <input
              type="password"
              placeholder="password (min 8)"
              required
              minLength={8}
              value={creating.password}
              onChange={(e) => setCreating({ ...creating, password: e.target.value })}
            />
            <select value={creating.role} onChange={(e) => setCreating({ ...creating, role: e.target.value })}>
              <option value="admin">admin</option>
              <option value="sub_admin">sub_admin</option>
              <option value="proctor">proctor</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit" className="primary" style={{ gridColumn: 'span 4' }}>
              Create user
            </button>
          </form>
        </Card>

        <h2 style={{ marginTop: 24 }}>Users</h2>
        <DataTable headers={['Email', 'Display', 'Role', 'Created', '']}>
          {items.map((u) => (
            <tr key={u.id}>
              <Td>{u.email}</Td>
              <Td>{u.display_name || '—'}</Td>
              <Td>{u.role}</Td>
              <Td>{new Date(u.created_at).toLocaleString()}</Td>
              <Td>
                <button type="button" onClick={() => setEditing(u)} style={{ marginRight: 6 }}>
                  Edit
                </button>
                <button type="button" onClick={() => void remove(u.id)} style={{ background: '#fee2e2' }}>
                  Delete
                </button>
              </Td>
            </tr>
          ))}
        </DataTable>

        {editing && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
            onClick={() => setEditing(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                padding: 20,
                borderRadius: 12,
                width: 'min(720px, 92vw)',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <h2 style={{ marginTop: 0 }}>Edit {editing.email}</h2>
              <label>
                Display name
                <input
                  value={editing.display_name || ''}
                  onChange={(e) => setEditing({ ...editing, display_name: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ display: 'block', marginTop: 12 }}>
                Role
                <select
                  value={editing.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    const perms = defaults[role] || editing.permissions;
                    setEditing({ ...editing, role, permissions: perms });
                  }}
                >
                  <option value="admin">admin</option>
                  <option value="sub_admin">sub_admin</option>
                  <option value="proctor">proctor</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
              <h3 style={{ marginTop: 16 }}>Permissions</h3>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th align="left">Resource</th>
                    <th align="left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((r) => {
                    const allActions = Array.from(
                      new Set(Object.values(defaults).flatMap((p) => p[r] || []))
                    );
                    return (
                      <tr key={r}>
                        <td style={{ padding: '4px 6px' }}>{r}</td>
                        <td style={{ padding: '4px 6px' }}>
                          {allActions.map((a) => {
                            const has = (editing.permissions[r] || []).includes(a);
                            return (
                              <label key={a} style={{ marginRight: 10, fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={has}
                                  onChange={() =>
                                    setEditing({
                                      ...editing,
                                      permissions: toggleAction(editing.permissions, r, a),
                                    })
                                  }
                                />{' '}
                                {a}
                              </label>
                            );
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="primary" onClick={() => void saveEdit()}>
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
