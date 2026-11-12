'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  SearchInput,
  Spinner,
  StatCard,
  Td,
  Toolbar,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { api, qs } from '@/lib/tenantApi';
import { formatDateTime } from '@/lib/format';

interface ReportSummary {
  total_candidates?: number;
  appeared?: number;
  absent?: number;
  submitted?: number;
  terminated?: number;
  total_violations?: number;
  avg_risk_score?: number | null;
  review_pending?: number;
  review_done?: number;
  flagged_count?: number;
  critical_violation_count?: number;
}

interface SevereRow {
  id: string;
  candidate_name?: string;
  risk_score?: number;
  highest_severity?: string;
  violation_count?: number;
  review_decision?: string | null;
  review_status?: string;
}

interface CandidateRow {
  id: string;
  candidate_name?: string;
  candidate_email?: string | null;
  status?: string;
  review_status?: string;
  review_decision?: string | null;
  risk_score?: number;
  highest_severity?: string | null;
  violation_count?: number;
  created_at?: string;
}

interface ExportJob {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  created_at?: string;
  finished_at?: string | null;
  error?: string | null;
}

interface ExamReportPayload {
  exam?: { id: string; title: string };
  summary?: ReportSummary;
  violations_by_type?: Array<{ code: string; count: number }>;
  violations_by_severity?: Array<{ severity: string; count: number }>;
  severe_offenders?: SevereRow[];
  candidates?: { items: CandidateRow[]; next_cursor?: string | null; total?: number };
}

const REVIEW_OPTIONS = [
  { value: '', label: 'Any review' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In review' },
  { value: 'reviewed', label: 'Reviewed' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'Any severity' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export default function ExamReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ExamReportPayload | null>(null);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');
  const [review, setReview] = useState('');
  const [severity, setSeverity] = useState('');
  const [violationType, setViolationType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candidateCursor, setCandidateCursor] = useState<string | null>(null);
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (opts?: { appendCandidates?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.appendCandidates && opts.cursor);
      try {
        if (!append) setLoading(true);
        const join = qs({
          q: q || undefined,
          review_status: review || undefined,
          severity: severity || undefined,
          violation_type: violationType || undefined,
          from: from || undefined,
          to: to || undefined,
          candidate_limit: 25,
          candidate_cursor: append ? opts?.cursor : undefined,
        });
        const r = await api<{ data: ExamReportPayload }>('GET', `/v1/exams/${id}/report${join}`);
        setReport(r.data);
        if (append) {
          setCandidates((prev) => [...prev, ...(r.data.candidates?.items || [])]);
        } else {
          setCandidates(r.data.candidates?.items || []);
        }
        setCandidateCursor(r.data.candidates?.next_cursor || null);
        setCandidateTotal(r.data.candidates?.total ?? null);
        setErr('');
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
      try {
        const j = await api<{ data: ExportJob[] }>('GET', `/v1/exams/${id}/exports`);
        setJobs(j.data || []);
      } catch {
        /* exports optional */
      }
    },
    [id, q, review, severity, violationType, from, to]
  );

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8_000);
    return () => clearInterval(t);
  }, [load]);

  const applyFilters = () => void load();

  const loadMoreCandidates = async () => {
    if (!candidateCursor) return;
    setLoadingMore(true);
    await load({ appendCandidates: true, cursor: candidateCursor });
  };

  const startExport = async (kind: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      await api('POST', `/v1/exams/${id}/exports`, {
        kind,
        scope: 'all',
        filters: {
          q: q || undefined,
          review_status: review || undefined,
          highest_severity: severity || undefined,
          violation_type: violationType || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary || {};
  const title = report?.exam?.title || 'Exam report';

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          breadcrumbs={[
            { href: '/exams', label: 'Exams' },
            { href: `/exams/${id}`, label: title },
            { label: 'Report' },
          ]}
          title="Cumulative exam report"
          description="Summary, severe offenders, and async exports. Huge exams: full candidate lists go to Excel/CSV; PDF is summary + flagged only."
          actions={
            <>
              <Button href={`/exams/${id}`} icon="chevronLeft">
                Exam
              </Button>
              <Button href={`/live/exams/${id}/candidates`} icon="live">
                Live workspace
              </Button>
              <Button variant="primary" icon="download" loading={exporting} onClick={() => void startExport('csv')}>
                Export CSV
              </Button>
              <Button icon="download" loading={exporting} onClick={() => void startExport('xlsx')}>
                Excel
              </Button>
              <Button icon="download" loading={exporting} onClick={() => void startExport('pdf')}>
                PDF
              </Button>
            </>
          }
        />
        {err && <p className="error">{err}</p>}
        {loading && !report ? (
          <Spinner label="Loading report…" />
        ) : (
          <>
            <Card title="Filters" description="Apply to severe list, violation breakdown, and paginated candidates." style={{ marginBottom: 16 }}>
              <Toolbar>
                <SearchInput value={q} onChange={setQ} placeholder="Search candidate name or email" />
                <label className="ps-field">
                  <span className="ps-muted">Review</span>
                  <select className="ps-select" value={review} onChange={(e) => setReview(e.target.value)} aria-label="Review filter">
                    {REVIEW_OPTIONS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ps-field">
                  <span className="ps-muted">Severity</span>
                  <select className="ps-select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity filter">
                    {SEVERITY_OPTIONS.map((o) => (
                      <option key={o.value || 'any'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ps-field">
                  <span className="ps-muted">Violation type</span>
                  <input
                    className="ps-input"
                    value={violationType}
                    onChange={(e) => setViolationType(e.target.value)}
                    placeholder="e.g. tab_switch"
                    aria-label="Violation type"
                  />
                </label>
                <label className="ps-field">
                  <span className="ps-muted">From</span>
                  <input className="ps-input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
                </label>
                <label className="ps-field">
                  <span className="ps-muted">To</span>
                  <input className="ps-input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
                </label>
                <Button variant="primary" onClick={() => void applyFilters()}>
                  Apply
                </Button>
              </Toolbar>
            </Card>

            <div className="ps-stats">
              <StatCard label="Candidates" value={summary.total_candidates ?? '—'} />
              <StatCard label="Appeared" value={summary.appeared ?? '—'} />
              <StatCard label="Submitted" value={summary.submitted ?? '—'} />
              <StatCard label="Terminated" value={summary.terminated ?? '—'} tone={summary.terminated ? 'warning' : 'default'} />
              <StatCard label="Violations" value={summary.total_violations ?? '—'} />
              <StatCard
                label="Avg risk"
                value={summary.avg_risk_score != null ? Math.round(Number(summary.avg_risk_score)) : '—'}
              />
              <StatCard label="Review pending" value={summary.review_pending ?? '—'} tone={summary.review_pending ? 'warning' : 'default'} />
              <StatCard label="Critical" value={summary.critical_violation_count ?? '—'} tone={summary.critical_violation_count ? 'danger' : 'default'} />
            </div>

            <div className="ps-grid ps-grid-main" style={{ marginTop: 16 }}>
              <Card title="Severe offenders" description="CRITICAL / HIGH risk candidates ranked by risk score.">
                <DataTable
                  headers={['Candidate', 'Risk', 'Severity', 'Violations', 'Decision']}
                  isEmpty={!report?.severe_offenders?.length}
                  empty={<EmptyState icon="flag" title="No severe cases" description="No CRITICAL/HIGH offenders match these filters." />}
                >
                  {(report?.severe_offenders || []).map((r) => (
                    <tr key={r.id} className="ps-row-link" onClick={() => (window.location.href = `/sessions/${r.id}`)}>
                      <Td>
                        <div className="ps-cell-primary">{r.candidate_name || r.id.slice(0, 8)}</div>
                      </Td>
                      <Td>{r.risk_score != null ? Math.round(Number(r.risk_score)) : '—'}</Td>
                      <Td>
                        <Badge tone="danger">{r.highest_severity || '—'}</Badge>
                      </Td>
                      <Td>{r.violation_count ?? 0}</Td>
                      <Td>{r.review_decision || '—'}</Td>
                    </tr>
                  ))}
                </DataTable>
              </Card>

              <Card title="Violations by severity">
                {!report?.violations_by_severity?.length ? (
                  <EmptyState icon="info" title="No violations" description="No violation events match these filters." />
                ) : (
                  <div className="ps-stack">
                    {report.violations_by_severity.map((v) => (
                      <div key={v.severity} className="ps-between">
                        <Badge tone={v.severity === 'critical' ? 'danger' : v.severity === 'flag' ? 'warning' : 'neutral'}>
                          {v.severity}
                        </Badge>
                        <strong>{v.count}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card
              title="Candidates"
              description={candidateTotal != null ? `${candidateTotal} matching sessions (cursor-paged).` : 'Filtered candidate sessions.'}
              style={{ marginTop: 16 }}
            >
              <DataTable
                headers={['Candidate', 'Status', 'Review', 'Risk', 'Severity', 'Violations', 'Created']}
                isEmpty={!candidates.length}
                empty={<EmptyState icon="users" title="No candidates" description="No sessions match the current filters." />}
              >
                {candidates.map((r) => (
                  <tr key={r.id} className="ps-row-link" onClick={() => (window.location.href = `/sessions/${r.id}`)}>
                    <Td>
                      <div className="ps-cell-primary">{r.candidate_name || r.id.slice(0, 8)}</div>
                      {r.candidate_email ? <div className="ps-muted">{r.candidate_email}</div> : null}
                    </Td>
                    <Td>{r.status || '—'}</Td>
                    <Td>{r.review_status || '—'}</Td>
                    <Td>{r.risk_score != null ? Math.round(Number(r.risk_score)) : '—'}</Td>
                    <Td>{r.highest_severity || '—'}</Td>
                    <Td>{r.violation_count ?? 0}</Td>
                    <Td muted>{formatDateTime(r.created_at)}</Td>
                  </tr>
                ))}
              </DataTable>
              {candidateCursor ? (
                <div style={{ marginTop: 12 }}>
                  <Button size="sm" loading={loadingMore} onClick={() => void loadMoreCandidates()}>
                    Load more
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card title="Export jobs" description="Async jobs; download when status is done." style={{ marginTop: 16 }}>
              {!jobs.length ? (
                <EmptyState icon="download" title="No exports yet" description="Start CSV / Excel / PDF above." />
              ) : (
                <DataTable headers={['Kind', 'Status', 'Progress', 'Created', '']}>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <Td>{j.kind}</Td>
                      <Td>
                        <Badge
                          tone={
                            j.status === 'done' ? 'success' : j.status === 'failed' ? 'danger' : j.status === 'running' ? 'info' : 'neutral'
                          }
                        >
                          {j.status}
                        </Badge>
                      </Td>
                      <Td>{j.progress != null ? `${j.progress}%` : '—'}</Td>
                      <Td muted>{formatDateTime(j.created_at)}</Td>
                      <Td>
                        {j.status === 'done' ? (
                          <Button
                            size="sm"
                            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/v1/exams/${id}/exports/${j.id}/download`}
                            icon="download"
                          >
                            Download
                          </Button>
                        ) : j.error ? (
                          <span className="ps-muted">{j.error}</span>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>

            {(report?.violations_by_type?.length || 0) > 0 && (
              <Card title="Violations by type" style={{ marginTop: 16 }}>
                <div className="ps-stack">
                  {report!.violations_by_type!.map((v) => (
                    <div key={v.code} className="ps-between">
                      <span>{v.code}</span>
                      <strong>{v.count}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
