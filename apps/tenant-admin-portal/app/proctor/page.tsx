'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  SeverityBadge,
  StatCard,
  Td,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { AssignProctorsPanel } from '@/components/AssignProctorsPanel';
import { loadProfile } from '@/lib/api';
import { api, type ExamRow, type Paged } from '@/lib/tenantApi';

type Assignment = {
  assignment_id: string;
  session_id: string;
  exam_id: string;
  exam_title?: string;
  candidate_name?: string;
  risk_score: number;
  risk_band: string;
  violation_count: number;
  last_violation_at?: string | null;
  session_status: string;
};

type Summary = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  live: number;
};

export default function ProctorDashboardPage() {
  const role = loadProfile()?.role;
  const isAdmin = !role || role === 'admin' || role === 'sub_admin' || role === 'tenant_admin';
  const [rows, setRows] = useState<Assignment[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, critical: 0, high: 0, medium: 0, live: 0 });
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [assignExamId, setAssignExamId] = useState('');

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    try {
      const r = await api<{ data: Assignment[]; summary: Summary }>(
        'GET',
        '/v1/tenant/proctoring/me/assignments',
        undefined,
        { auth: opts?.soft ? 'soft' : 'hard' }
      );
      setRows(r.data || []);
      setSummary(r.summary || { total: 0, critical: 0, high: 0, medium: 0, live: 0 });
      setErr('');
    } catch (e) {
      if (!opts?.soft) setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load({ soft: true });
    };
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api<Paged<ExamRow>>('GET', '/v1/exams?limit=100')
      .then((r) => {
        const list = r.data || [];
        setExams(list);
        setAssignExamId((prev) => prev || list[0]?.id || '');
      })
      .catch(() => {});
  }, [isAdmin]);

  const filtered = rows.filter((r) => (filter === 'all' ? true : r.risk_band === filter));

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Proctors"
          description={
            isAdmin
              ? 'Assign high-risk candidates to proctors, then monitor ownership from this page.'
              : 'Candidates assigned to you for live monitoring. Risk updates continuously; ownership stays yours.'
          }
          actions={
            <Button icon="refresh" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <Card title="Choose exam" description="Allocation runs per exam. Pick one, then assign below.">
              <Field label="Exam">
                <select value={assignExamId} onChange={(e) => setAssignExamId(e.target.value)} aria-label="Exam for assignment">
                  {exams.length === 0 && <option value="">No exams</option>}
                  {exams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </Field>
            </Card>
            {assignExamId ? (
              <div style={{ marginTop: 12 }}>
                <AssignProctorsPanel examId={assignExamId} />
              </div>
            ) : null}
          </div>
        )}

        <div className="ps-stat-grid" style={{ marginBottom: 16 }}>
          <StatCard label="Assigned" value={String(summary.total)} />
          <StatCard label="Critical" value={String(summary.critical)} />
          <StatCard label="High" value={String(summary.high)} />
          <StatCard label="Live streams" value={String(summary.live)} />
        </div>

        <Card title="Assigned candidates" description="Ordered by current risk. Click View to open live monitoring.">
          <div className="ps-inline" style={{ marginBottom: 12, gap: 8 }}>
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
              <Button key={f} variant={filter === f ? 'primary' : 'secondary'} onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
          <DataTable
            headers={['Candidate', 'Exam', 'Risk', 'Violations', 'Last violation', 'Status', '']}
            isEmpty={!filtered.length}
            empty={
              <EmptyState
                icon="users"
                title="No candidates assigned"
                description={isAdmin ? 'Use Assign proctors above to distribute eligible sessions.' : 'When admins allocate high-risk sessions, they appear here.'}
              />
            }
          >
            {filtered.map((r) => (
              <tr key={r.assignment_id}>
                <Td>
                  <strong>{r.candidate_name || 'Candidate'}</strong>
                </Td>
                <Td>{r.exam_title || '—'}</Td>
                <Td>
                  <SeverityBadge severity={r.risk_band}>
                    {r.risk_band} ({Math.round(Number(r.risk_score) || 0)})
                  </SeverityBadge>
                </Td>
                <Td>{r.violation_count}</Td>
                <Td muted nowrap>
                  {r.last_violation_at ? new Date(r.last_violation_at).toLocaleString() : '—'}
                </Td>
                <Td>{r.session_status}</Td>
                <Td>
                  <Link href={`/live/exams/${r.exam_id}/candidates/${r.session_id}`}>
                    <Button variant="primary">View</Button>
                  </Link>
                </Td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
