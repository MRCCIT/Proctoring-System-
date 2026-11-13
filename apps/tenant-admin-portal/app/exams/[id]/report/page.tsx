'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  SearchInput,
  SeverityBadge,
  Spinner,
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
import { api, qs } from '@/lib/tenantApi';
import { downloadExportFile } from '@/lib/exportDownload';
import { decisionLabel, formatDateTime } from '@/lib/format';

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
  status?: string;
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

type ExportKind = 'csv' | 'xlsx' | 'pdf';

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

const EXPORT_ACTIONS: Array<{ kind: ExportKind; label: string }> = [
  { kind: 'csv', label: 'CSV' },
  { kind: 'xlsx', label: 'Excel' },
  { kind: 'pdf', label: 'PDF' },
];

export default function ExamReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ExamReportPayload | null>(null);
  const [err, setErr] = useState('');
  const [exportingKind, setExportingKind] = useState<ExportKind | null>(null);
  const [q, setQ] = useState('');
  const [review, setReview] = useState('');
  const [severity, setSeverity] = useState('');
  const [violationType, setViolationType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({
    q: '',
    review: '',
    severity: '',
    violationType: '',
    from: '',
    to: '',
  });
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const pager = useClientPagination(candidates, 10);

  const filterParams = useMemo(
    () => ({
      q: applied.q || undefined,
      review_status: applied.review || undefined,
      severity: applied.severity || undefined,
      violation_type: applied.violationType || undefined,
      from: applied.from || undefined,
      to: applied.to || undefined,
    }),
    [applied]
  );

  const filtersActive = Boolean(q || review || severity || violationType || from || to || Object.values(applied).some(Boolean));

  const load = useCallback(
    async (opts?: { silent?: boolean; filters?: typeof filterParams }) => {
      const filters = opts?.filters || filterParams;
      try {
        if (!opts?.silent) setLoading(true);
        const join = qs({
          ...filters,
          candidate_limit: 100,
        });
        const r = await api<{ data: ExamReportPayload }>(
          'GET',
          `/v1/exams/${id}/report${join}`,
          undefined,
          { auth: opts?.silent ? 'soft' : 'hard' }
        );
        setReport(r.data);
        setCandidates(r.data.candidates?.items || []);
        setCandidateTotal(r.data.candidates?.total ?? null);
        if (!exportingKind) setErr('');
      } catch (e) {
        if (!exportingKind && !opts?.silent) setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [id, filterParams, exportingKind]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when exam or applied filters change
  }, [id, applied]);

  useEffect(() => {
    if (exportingKind) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load({ silent: true });
    };
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [load, exportingKind]);

  const applyFilters = () => {
    setApplied({ q, review, severity, violationType, from, to });
  };

  const clearFilters = () => {
    setQ('');
    setReview('');
    setSeverity('');
    setViolationType('');
    setFrom('');
    setTo('');
    setApplied({ q: '', review: '', severity: '', violationType: '', from: '', to: '' });
  };

  const startExport = async (kind: ExportKind) => {
    if (exportingKind) return;
    if (typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.();
    setExportingKind(kind);
    setErr('');
    try {
      const created = await api<{ data: ExportJob }>('POST', `/v1/exams/${id}/exports`, {
        kind,
        scope: 'all',
        filters: {
          q: filterParams.q,
          review_status: filterParams.review_status,
          highest_severity: filterParams.severity,
          violation_type: filterParams.violation_type,
          from: filterParams.from,
          to: filterParams.to,
        },
      });
      const jobId = created.data?.id;
      if (!jobId) throw new Error('Export job was not created');

      let final: ExportJob | null = null;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const polled = await api<{ data: ExportJob }>('GET', `/v1/exams/${id}/exports/${jobId}`);
        final = polled.data;
        if (polled.data.status === 'done') break;
        if (polled.data.status === 'failed') {
          throw new Error(polled.data.error || 'Export failed');
        }
      }

      if (!final || final.status !== 'done') {
        throw new Error('Export timed out. Try again in a moment.');
      }

      await downloadExportFile(id, jobId, kind);
      await load({ silent: true });
    } catch (e) {
      const msg = (e as Error).message || 'Export failed';
      if (msg === 'Failed to fetch') {
        setErr('Could not reach the API for export. Check that platform-api is running and reachable.');
      } else if (/deferred under load/i.test(msg)) {
        setErr(
          `${msg} Tip: Super Admin → Infrastructure → System controls → set load to L0–L3, then retry PDF/CSV/Excel.`
        );
      } else {
        setErr(msg);
      }
    } finally {
      setExportingKind(null);
    }
  };

  const summary = report?.summary || {};
  const title = report?.exam?.title || 'Exam report';
  const severityMax = Math.max(1, ...(report?.violations_by_severity || []).map((v) => Number(v.count || 0)));
  const typeMax = Math.max(1, ...(report?.violations_by_type || []).map((v) => Number(v.count || 0)));

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          breadcrumbs={[
            { href: '/exams', label: 'Exams' },
            { href: `/exams/${id}`, label: title },
            { label: 'Report' },
          ]}
          title={title}
          description="Integrity summary for this exam — exports download when ready."
          actions={
            <>
              <Button href={`/exams/${id}`} icon="chevronLeft">
                Exam
              </Button>
              <Button href={`/live/exams/${id}/candidates`} icon="live">
                Live
              </Button>
              <span className="ps-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {EXPORT_ACTIONS.map(({ kind, label }) => (
                  <Button
                    key={kind}
                    icon="download"
                    loading={exportingKind === kind}
                    disabled={Boolean(exportingKind) && exportingKind !== kind}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void startExport(kind)}
                  >
                    {label}
                  </Button>
                ))}
              </span>
            </>
          }
        />

        {err ? (
          <Alert tone="danger" title="Something went wrong">
            {err}
          </Alert>
        ) : null}

        {exportingKind ? (
          <Alert tone="info" title={`Preparing ${exportingKind.toUpperCase()}…`}>
            Stay on this page — download starts automatically when the file is ready.
          </Alert>
        ) : null}

        {loading && !report ? (
          <Spinner label="Loading report…" />
        ) : (
          <>
            <div className="ps-stats">
              <StatCard label="Candidates" value={summary.total_candidates ?? '—'} />
              <StatCard label="Appeared" value={summary.appeared ?? '—'} />
              <StatCard label="Absent" value={summary.absent ?? '—'} />
              <StatCard label="Submitted" value={summary.submitted ?? '—'} />
              <StatCard label="Terminated" value={summary.terminated ?? '—'} tone={summary.terminated ? 'warning' : 'default'} />
              <StatCard label="Violations" value={summary.total_violations ?? '—'} />
              <StatCard
                label="Avg risk"
                value={summary.avg_risk_score != null ? Math.round(Number(summary.avg_risk_score)) : '—'}
              />
              <StatCard
                label="Review pending"
                value={summary.review_pending ?? '—'}
                tone={summary.review_pending ? 'warning' : 'default'}
              />
              <StatCard
                label="Critical"
                value={summary.critical_violation_count ?? '—'}
                tone={summary.critical_violation_count ? 'danger' : 'default'}
              />
            </div>

            <Card title="Filters" description="Narrow severe cases, violation breakdown, and candidates." style={{ marginBottom: 16 }}>
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
                <span className="ps-toolbar-spacer" />
                {filtersActive ? <Button onClick={clearFilters}>Clear</Button> : null}
                <Button variant="primary" onClick={applyFilters}>
                  Apply
                </Button>
              </Toolbar>
            </Card>

            <div className="ps-grid ps-grid-main" style={{ marginTop: 4 }}>
              <Card title="Severe offenders" description="Highest-risk candidates for review.">
                <DataTable
                  headers={['Candidate', 'Risk', 'Severity', 'Violations', 'Decision']}
                  isEmpty={!report?.severe_offenders?.length}
                  empty={<EmptyState icon="flag" title="No severe cases" description="No CRITICAL/HIGH offenders match these filters." />}
                >
                  {(report?.severe_offenders || []).map((r) => (
                    <tr key={r.id} className="ps-row-link" onClick={() => router.push(`/sessions/${r.id}`)}>
                      <Td>
                        <div className="ps-cell-primary">{r.candidate_name || r.id.slice(0, 8)}</div>
                      </Td>
                      <Td nowrap>{r.risk_score != null ? Math.round(Number(r.risk_score)) : '—'}</Td>
                      <Td>
                        <SeverityBadge severity={r.highest_severity} />
                      </Td>
                      <Td>{r.violation_count ?? 0}</Td>
                      <Td>{decisionLabel(r.review_decision) || '—'}</Td>
                    </tr>
                  ))}
                </DataTable>
              </Card>

              <Card title="Violations by severity" description="Share of detections in this filter set.">
                {!report?.violations_by_severity?.length ? (
                  <EmptyState icon="info" title="No violations" description="No violation events match these filters." />
                ) : (
                  <div className="ps-stack" style={{ gap: 12 }}>
                    {report.violations_by_severity.map((v) => {
                      const pct = Math.round((100 * Number(v.count || 0)) / severityMax);
                      return (
                        <div key={v.severity} className="ps-stack" style={{ gap: 6 }}>
                          <div className="ps-between">
                            <SeverityBadge severity={v.severity} />
                            <strong>{v.count}</strong>
                          </div>
                          <div
                            aria-hidden
                            style={{
                              height: 6,
                              borderRadius: 999,
                              background: 'var(--ps-border)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                borderRadius: 999,
                                background: 'var(--ps-brand)',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            <Card
              title="Candidates"
              description={
                candidateTotal != null
                  ? `${candidateTotal.toLocaleString()} matching session${candidateTotal === 1 ? '' : 's'}${
                      candidateTotal > candidates.length
                        ? ` · showing first ${candidates.length} here; export CSV/Excel for the full list`
                        : ''
                    }`
                  : 'Filtered candidate sessions'
              }
              style={{ marginTop: 16 }}
            >
              <DataTable
                headers={['Candidate', 'Status', 'Review', 'Risk', 'Severity', 'Violations', 'Created']}
                isEmpty={!pager.pageItems.length}
                empty={<EmptyState icon="users" title="No candidates" description="No sessions match the current filters." />}
              >
                {pager.pageItems.map((r) => (
                  <tr key={r.id} className="ps-row-link" onClick={() => router.push(`/sessions/${r.id}`)}>
                    <Td>
                      <div className="ps-cell-primary">{r.candidate_name || r.id.slice(0, 8)}</div>
                      {r.candidate_email ? <div className="ps-muted">{r.candidate_email}</div> : null}
                    </Td>
                    <Td>{r.status ? <StatusBadge status={r.status} /> : '—'}</Td>
                    <Td>
                      <ReviewBadge
                        row={{
                          review_status: (r.review_status as 'pending' | 'in_review' | 'reviewed') || 'pending',
                          review_decision: (r.review_decision as 'cleared' | 'flagged' | 'inconclusive' | null) || null,
                          status: r.status || 'completed',
                        }}
                      />
                    </Td>
                    <Td nowrap>{r.risk_score != null ? Math.round(Number(r.risk_score)) : '—'}</Td>
                    <Td>{r.highest_severity ? <SeverityBadge severity={r.highest_severity} /> : '—'}</Td>
                    <Td>{r.violation_count ?? 0}</Td>
                    <Td muted nowrap>
                      {formatDateTime(r.created_at)}
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
            </Card>

            {(report?.violations_by_type?.length || 0) > 0 && (
              <Card title="Violations by type" style={{ marginTop: 16 }}>
                <div className="ps-stack" style={{ gap: 10 }}>
                  {report!.violations_by_type!.map((v) => {
                    const pct = Math.round((100 * Number(v.count || 0)) / typeMax);
                    return (
                      <div key={v.code} className="ps-stack" style={{ gap: 4 }}>
                        <div className="ps-between">
                          <span>{v.code}</span>
                          <strong>{v.count}</strong>
                        </div>
                        <div
                          aria-hidden
                          style={{
                            height: 4,
                            borderRadius: 999,
                            background: 'var(--ps-border)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: 'var(--ps-brand)',
                              opacity: 0.75,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
