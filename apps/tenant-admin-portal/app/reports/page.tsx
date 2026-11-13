'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
  SeverityBadge,
  Skeleton,
  StatCard,
  StatusBadge,
  TablePagination,
  Td,
  Toolbar,
  useClientPagination,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { ReviewBadge } from '@/components/SessionsTable';
import { getClient } from '@/lib/api';
import { formatDuration } from '@/lib/format';

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
  email: string | null;
  name: string | null;
  external_ref?: string | null;
  attended: boolean;
  session_id?: string | null;
  status: string | null;
  success: boolean | null;
  review_status?: string | null;
  review_decision?: string | null;
  risk_score?: number | null;
  highest_severity?: string | null;
  violation_count?: number | null;
  high_severity_count?: number | null;
  violation_flags?: number | null;
}

const STAT_META: Record<
  string,
  { label: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'; format?: (v: number | string) => string }
> = {
  candidates: { label: 'Unique candidates', tone: 'info' },
  attempts: { label: 'Attempts', tone: 'info' },
  sessions: { label: 'Attempts', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  terminated: { label: 'Terminated', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  paused: { label: 'Paused', tone: 'warning' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  passed: { label: 'Cleared', tone: 'success' },
  failed_review: { label: 'Flagged outcome', tone: 'danger' },
  pass_rate: { label: 'Clear rate %', tone: 'info', format: (v) => `${v}%` },
  total_violations: { label: 'Total detections', tone: 'danger' },
  high_severity_violations: { label: 'High / critical', tone: 'danger' },
  avg_duration_seconds: {
    label: 'Avg duration',
    format: (v) => formatDuration(typeof v === 'string' ? Number(v) : v),
  },
};

const STAT_ORDER = [
  'candidates',
  'attempts',
  'active',
  'completed',
  'terminated',
  'failed',
  'needs_review',
  'total_violations',
  'high_severity_violations',
  'pass_rate',
  'avg_duration_seconds',
];

export default function ReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [report, setReport] = useState<ExamReport | null>(null);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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
    setLoading(true);
    setReport(null);
    setAtt([]);
    setErr('');
    Promise.all([
      getClient().getExamReport(examId).then((r) => setReport(r.data as ExamReport)),
      getClient()
        .getAttendanceReport(examId)
        .then((r) => setAtt(((r.data as { candidates: AttendanceRow[] }).candidates as AttendanceRow[]) || [])),
    ])
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [examId, reloadKey]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return att;
    return att.filter((r) => {
      const hay = [r.name, r.email, r.external_ref, r.status, r.review_status, r.session_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [att, q]);

  const pager = useClientPagination(filtered, 10);

  const stats = report?.statistics || {};
  const seen = new Set<string>();
  const statEntries = STAT_ORDER.map((key) => {
    if (key === 'attempts' && stats.attempts == null && stats.sessions != null) {
      seen.add('sessions');
      return ['attempts', stats.sessions] as const;
    }
    if (key === 'sessions') return null;
    if (stats[key] == null) return null;
    seen.add(key);
    return [key, stats[key]] as const;
  }).filter(Boolean) as Array<readonly [string, number | string]>;

  for (const [k, v] of Object.entries(stats)) {
    if (seen.has(k) || k === 'sessions' || k === 'violation_flags' || k === 'passed' || k === 'failed_review' || k === 'paused') {
      continue;
    }
    if (STAT_ORDER.includes(k)) continue;
    statEntries.push([k, v]);
  }

  const examTotalDetections = Number(stats.total_violations || 0);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Reports & compliance"
          description="Exam-level candidate attempts with the same detection counts as session review (not legacy flag counters)."
          actions={
            examId ? (
              <Button variant="primary" icon="download" href={getClient().getAttendanceReportCsv(examId)}>
                Download CSV
              </Button>
            ) : null
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <Card>
          <Toolbar>
            <Field label="Exam">
              <select value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="Select exam" style={{ minWidth: 260 }}>
                {exams.length === 0 && <option value="">No exams</option>}
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </Field>
            <Button icon="refresh" disabled={!examId || loading} onClick={() => setReloadKey((k) => k + 1)}>
              Refresh
            </Button>
          </Toolbar>
        </Card>

        {loading && !report ? (
          <div className="ps-stats" style={{ marginTop: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={88} />
            ))}
          </div>
        ) : null}

        {report && (
          <div style={{ marginTop: 16 }}>
            <Card
              title={report.exam.title}
              description={
                examTotalDetections
                  ? `${examTotalDetections} detections across all attempts — matches the Violations total on each session review page.`
                  : 'Candidate attempts and detection totals for this exam.'
              }
            >
              <div className="ps-stats" style={{ marginBottom: 0 }}>
                {statEntries.map(([k, v]) => {
                  const meta = STAT_META[k] || { label: k.replace(/_/g, ' ') };
                  const value = meta.format ? meta.format(v) : String(v);
                  return <StatCard key={k} label={meta.label} value={value} tone={meta.tone || 'default'} />;
                })}
              </div>
            </Card>
          </div>
        )}

        {examId && (
          <div style={{ marginTop: 16 }}>
            <Card
              title={`Attempts (${filtered.length}${q.trim() ? ` of ${att.length}` : ''})`}
              description="Each row is one proctoring attempt. Violations = detection events (same number as session Review)."
              actions={
                <Button size="sm" icon="download" href={getClient().getAttendanceReportCsv(examId)}>
                  CSV
                </Button>
              }
            >
              <Toolbar>
                <SearchInput value={q} onChange={setQ} placeholder="Search candidate, email, or status" />
              </Toolbar>
              <DataTable
                headers={['Candidate', 'Status', 'Review', 'Detections', 'Risk', '']}
                isEmpty={!loading && pager.pageItems.length === 0}
                empty={
                  <EmptyState
                    icon="users"
                    title="No attempts for this exam"
                    description="Rows appear when a candidate starts a proctoring session for the selected exam."
                  />
                }
              >
                {loading && att.length === 0
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="ps-table-empty">
                          <Skeleton height={16} />
                        </td>
                      </tr>
                    ))
                  : pager.pageItems.map((r) => {
                      const violations = Number(r.violation_count ?? r.violation_flags ?? 0);
                      const high = Number(r.high_severity_count || 0);
                      return (
                        <tr key={r.session_id || r.candidate_id}>
                          <Td>
                            <div className="ps-cell-primary">{r.name || r.external_ref || 'Unnamed candidate'}</div>
                            <div className="ps-cell-sub">
                              {r.email || r.external_ref || (r.session_id ? r.session_id.slice(0, 8) : '—')}
                            </div>
                          </Td>
                          <Td>{r.status ? <StatusBadge status={r.status} /> : <span className="ps-muted">—</span>}</Td>
                          <Td>
                            <ReviewBadge
                              row={{
                                review_status: (r.review_status as 'pending' | 'in_review' | 'reviewed') || 'pending',
                                review_decision: (r.review_decision as 'cleared' | 'flagged' | 'inconclusive' | null) || null,
                                status: r.status || 'scheduled',
                              }}
                            />
                          </Td>
                          <Td>
                            <span className="ps-row" style={{ gap: 6 }}>
                              <strong style={{ color: violations ? 'var(--ps-danger)' : undefined }}>{violations}</strong>
                              {high > 0 && <Badge tone="high">{high} high</Badge>}
                            </span>
                          </Td>
                          <Td>
                            <span className="ps-row" style={{ gap: 6 }}>
                              {r.risk_score != null ? Math.round(Number(r.risk_score)) : '—'}
                              {r.highest_severity ? <SeverityBadge severity={r.highest_severity} /> : null}
                            </span>
                          </Td>
                          <Td>
                            {r.session_id ? (
                              <Button size="sm" href={`/sessions/${r.session_id}`}>
                                Open
                              </Button>
                            ) : (
                              <span className="ps-muted">—</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
              </DataTable>
              <TablePagination
                mode="pages"
                page={pager.page}
                pageSize={pager.pageSize}
                total={filtered.length}
                onPageChange={pager.setPage}
                onPageSizeChange={pager.setPageSize}
              />
            </Card>
          </div>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
