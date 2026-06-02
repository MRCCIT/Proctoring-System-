'use client';

import { useEffect, useState } from 'react';
import { Card, DataTable, Td } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface Exam {
  id: string;
  title: string;
}

interface ExamReport {
  exam: { id: string; title: string };
  statistics: Record<string, number | string>;
}

interface AttendanceRow {
  candidate_id: string;
  email: string;
  name: string | null;
  attended: boolean;
  status: string | null;
  success: boolean | null;
  violation_flags: number | null;
}

export default function ReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [report, setReport] = useState<ExamReport | null>(null);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    void getClient()
      .listExams()
      .then((r) => {
        const list = r.data as Exam[];
        setExams(list);
        if (list[0]) setExamId(list[0].id);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!examId) return;
    setReport(null);
    setAtt([]);
    void getClient().getExamReport(examId).then((r) => setReport(r.data as ExamReport)).catch((e) => setErr((e as Error).message));
    void getClient()
      .getAttendanceReport(examId)
      .then((r) => setAtt(((r.data as { candidates: AttendanceRow[] }).candidates as AttendanceRow[]) || []))
      .catch((e) => setErr((e as Error).message));
  }, [examId]);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <h1>Reports & compliance</h1>
        <p className="muted">Per-exam statistics, attendance, and CSV export.</p>
        {err && <p className="error">{err}</p>}
        <label>
          Exam{' '}
          <select value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        {report && (
          <Card>
            <h2 style={{ marginTop: 0 }}>{report.exam.title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {Object.entries(report.statistics).map(([k, v]) => (
                <div key={k} style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                  <div style={{ color: '#64748b', fontSize: 12, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{String(v)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {examId && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <h2 style={{ margin: 0 }}>Attendance ({att.length})</h2>
              <a
                href={getClient().getAttendanceReportCsv(examId)}
                target="_blank"
                rel="noreferrer"
                className="primary"
                style={{ background: '#0f172a', color: '#fff', padding: '6px 12px', borderRadius: 6, textDecoration: 'none' }}
              >
                Download CSV
              </a>
            </div>
            <DataTable headers={['Email', 'Name', 'Attended', 'Status', 'Success', 'Violations']}>
              {att.map((r) => (
                <tr key={r.candidate_id}>
                  <Td>{r.email}</Td>
                  <Td>{r.name || '—'}</Td>
                  <Td>{r.attended ? 'Yes' : 'No'}</Td>
                  <Td>{r.status || '—'}</Td>
                  <Td>{r.success == null ? '—' : r.success ? 'Pass' : 'Fail'}</Td>
                  <Td>{r.violation_flags ?? 0}</Td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
