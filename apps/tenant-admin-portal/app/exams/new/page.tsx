'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

export default function NewExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ai_sensitivity, setSensitivity] = useState('normal');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await getClient().createExam({
        title,
        description,
        ai_sensitivity,
        ai_modules: { face: true, gaze: true },
        policy_template: {},
        branding: { primary_color: '#0f172a' },
      });
      router.push(`/exams/${(res.data as { id: string }).id}`);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Create exam</h1>
        <p className="muted">POST /v1/exams</p>
        <Card>
          <form onSubmit={submit}>
            <p>
              <label>Title</label>
              <br />
              <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
            </p>
            <p>
              <label>Description</label>
              <br />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
            </p>
            <p>
              <label>AI sensitivity</label>
              <br />
              <select value={ai_sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
              </select>
            </p>
            {err && <p className="error">{err}</p>}
            <button type="submit" className="primary">
              Create
            </button>
          </form>
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
