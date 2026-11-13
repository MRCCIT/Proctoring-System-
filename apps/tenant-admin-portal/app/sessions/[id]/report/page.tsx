'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
  Td,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { api } from '@/lib/tenantApi';
import { downloadSessionIntegrityPdf } from '@/lib/sessionReportDownload';
import { decisionLabel, formatDateTime, formatDuration, formatOffset, formatTime } from '@/lib/format';

type IntegrityReport = {
  generated_at?: string;
  organization?: string | null;
  session?: {
    id: string;
    status?: string;
    started_at?: string | null;
    ended_at?: string | null;
    duration_seconds?: number | null;
  };
  candidate?: { name?: string | null; email?: string | null; external_candidate_id?: string | null };
  exam?: { id?: string; title?: string | null; external_exam_id?: string | null };
  violations?: {
    total: number;
    open: number;
    confirmed: number;
    dismissed: number;
    by_type: Array<{
      code: string;
      label: string;
      severity: string;
      total: number;
      open: number;
      confirmed: number;
      dismissed: number;
    }>;
  };
  timeline?: Array<{
    id: string;
    occurred_at: string;
    offset_seconds: number | null;
    label: string;
    severity: string;
    source: string;
    review_status: string;
  }>;
  evidence?: { snapshot_count?: number; recordings?: unknown[] };
  review?: {
    status?: string | null;
    decision?: string | null;
    summary?: string | null;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
  };
  disclaimer?: string;
};

export default function SessionIntegrityReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await api<{ data: IntegrityReport }>('GET', `/v1/sessions/${id}/integrity-report`);
      setReport(r.data);
    } catch (e) {
      setErr((e as Error).message || 'Could not load integrity report');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadPdf = async () => {
    setBusy(true);
    setErr('');
    try {
      await downloadSessionIntegrityPdf(id, report?.candidate?.name);
    } catch (e) {
      setErr((e as Error).message || 'PDF download failed');
    } finally {
      setBusy(false);
    }
  };

  const title = report?.candidate?.name || 'Integrity report';
  const examTitle = report?.exam?.title || 'Exam';

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          breadcrumbs={[
            { href: '/sessions', label: 'Sessions' },
            { href: `/sessions/${id}`, label: title },
            { label: 'Integrity report' },
          ]}
          title={title}
          description={
            <>
              {examTitle}
              {report?.organization ? ` · ${report.organization}` : ''}
              {' — session integrity summary for review and export.'}
            </>
          }
          actions={
            <>
              <Button href={`/sessions/${id}`} icon="chevronLeft">
                Session
              </Button>
              <Button variant="primary" icon="download" loading={busy} onClick={() => void downloadPdf()}>
                Download PDF
              </Button>
            </>
          }
        />

        {err ? (
          <Alert tone="danger" title="Something went wrong">
            {err}
          </Alert>
        ) : null}

        {loading || !report ? (
          <Spinner label="Loading integrity report…" />
        ) : (
          <>
            <div className="ps-stats">
              <StatCard
                label="Started"
                value={<span style={{ fontSize: 16 }}>{formatDateTime(report.session?.started_at)}</span>}
                hint={report.session?.ended_at ? `Ended ${formatDateTime(report.session.ended_at)}` : undefined}
              />
              <StatCard label="Duration" value={formatDuration(report.session?.duration_seconds)} />
              <StatCard
                label="Violations"
                value={report.violations?.total ?? 0}
                tone={report.violations?.total ? 'danger' : 'success'}
                hint={`${report.violations?.open ?? 0} open · ${report.violations?.confirmed ?? 0} confirmed`}
              />
              <StatCard
                label="Decision"
                value={decisionLabel(report.review?.decision) || report.review?.status || 'Pending'}
                tone={report.review?.decision === 'flagged' ? 'danger' : report.review?.decision === 'cleared' ? 'success' : 'warning'}
              />
              <StatCard
                label="Evidence"
                value={report.evidence?.snapshot_count ?? 0}
                hint={`${report.evidence?.recordings?.length ?? 0} recording track(s)`}
              />
            </div>

            <div className="ps-grid ps-grid-main">
              <Card title="Candidate & exam" description="Who was monitored and under which assessment.">
                <dl className="ps-kv">
                  <div>
                    <dt>Candidate</dt>
                    <dd>{report.candidate?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{report.candidate?.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>External ID</dt>
                    <dd>{report.candidate?.external_candidate_id || '—'}</dd>
                  </div>
                  <div>
                    <dt>Exam</dt>
                    <dd>{report.exam?.title || '—'}</dd>
                  </div>
                  <div>
                    <dt>Session</dt>
                    <dd style={{ fontSize: 12 }}>{report.session?.id}</dd>
                  </div>
                  <div>
                    <dt>Generated</dt>
                    <dd>{formatDateTime(report.generated_at)}</dd>
                  </div>
                </dl>
              </Card>

              <Card title="Integrity decision" description="Human review outcome shared with the assessment platform.">
                {report.review?.summary ? (
                  <p style={{ marginTop: 0, lineHeight: 1.55 }}>{report.review.summary}</p>
                ) : (
                  <EmptyState icon="review" title="No decision yet" description="Save a decision on the session Review tab first." />
                )}
                {report.review?.reviewed_by ? (
                  <p className="ps-muted" style={{ fontSize: 13 }}>
                    By {report.review.reviewed_by} · {formatDateTime(report.review.reviewed_at)}
                  </p>
                ) : null}
              </Card>
            </div>

            <Card title="Violations by type" description="Grouped automated and browser signals for this attempt." flush>
              {(report.violations?.by_type || []).length === 0 ? (
                <EmptyState icon="check" title="No detections" description="No violation signals were recorded." />
              ) : (
                <DataTable headers={['Signal', 'Severity', 'Total', 'Open', 'Confirmed', 'Dismissed']}>
                  {(report.violations?.by_type || []).map((r) => (
                    <tr key={r.code}>
                      <Td>
                        <strong>{r.label || r.code}</strong>
                      </Td>
                      <Td>
                        <Badge tone={r.severity === 'critical' || r.severity === 'high' ? 'danger' : 'warning'}>
                          {r.severity}
                        </Badge>
                      </Td>
                      <Td>{r.total}</Td>
                      <Td>{r.open}</Td>
                      <Td>{r.confirmed}</Td>
                      <Td>{r.dismissed}</Td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>

            <Card
              title={`Detection timeline (${report.timeline?.length || 0})`}
              description="Chronological detections — full detail is in the PDF export."
              flush
            >
              {(report.timeline || []).length === 0 ? (
                <EmptyState icon="sessions" title="Empty timeline" description="No detections to list." />
              ) : (
                <DataTable headers={['Offset', 'Time', 'Detection', 'Severity', 'Source', 'Review']}>
                  {(report.timeline || []).slice(0, 100).map((t) => (
                    <tr key={t.id}>
                      <Td>{t.offset_seconds == null ? '—' : formatOffset(t.offset_seconds)}</Td>
                      <Td>{formatTime(t.occurred_at)}</Td>
                      <Td>
                        <strong>{t.label}</strong>
                      </Td>
                      <Td>{t.severity}</Td>
                      <Td>{t.source}</Td>
                      <Td>{t.review_status}</Td>
                    </tr>
                  ))}
                </DataTable>
              )}
              {(report.timeline?.length || 0) > 100 ? (
                <p className="ps-muted" style={{ padding: '8px 16px', fontSize: 13 }}>
                  Showing first 100 rows on screen — PDF includes up to 80 detailed rows plus type totals.
                </p>
              ) : null}
            </Card>

            {report.disclaimer ? (
              <Alert tone="warning" title="Disclaimer">
                {report.disclaimer}
              </Alert>
            ) : null}
          </>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
