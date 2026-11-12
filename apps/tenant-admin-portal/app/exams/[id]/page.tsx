'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, KeyValue, PageHeader, Spinner, StatCard, Tabs } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { SessionsTable } from '@/components/SessionsTable';
import { AccessLinksPanel } from '@/components/AccessLinksPanel';
import { ExamFormModal } from '@/components/ExamFormModal';
import { api, type ExamRow } from '@/lib/tenantApi';
import { formatDateTime, formatDuration } from '@/lib/format';
import { API_BASE } from '@/lib/api';

type Tab = 'sessions' | 'links' | 'details' | 'report';

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('sessions');
  const [edit, setEdit] = useState(false);

  const load = useCallback(() => {
    api<{ data: ExamRow }>('GET', `/v1/exams/${id}`)
      .then((r) => setExam(r.data))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const snippet = exam
    ? `curl -X POST ${API_BASE}/v1/integration/sessions \\
  -H "X-API-Key: $PROCTORSHIELD_API_KEY" \\
  -H "Idempotency-Key: <attempt-uuid>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_exam_id": "${exam.external_exam_id || '<set an external exam id>'}",
    "exam_title": "${exam.title.replace(/"/g, '\\"')}",
    "external_candidate_id": "<your candidate id>",
    "candidate_name": "<full name>",
    "external_attempt_id": "<attempt id>"
  }'`
    : '';

  return (
    <AuthGuard>
      <TenantAdminShell>
        {err && <p className="error">{err}</p>}
        {!exam ? (
          <Spinner label="Loading exam…" />
        ) : (
          <>
            <PageHeader
              breadcrumbs={[{ href: '/exams', label: 'Exams' }, { label: exam.title }]}
              title={exam.title}
              description={exam.description || undefined}
              meta={
                <>
                  {exam.external_exam_id && <Badge tone="brand">External ID · {exam.external_exam_id}</Badge>}
                  {exam.live_count > 0 && (
                    <Badge tone="success" dot>
                      {exam.live_count} live
                    </Badge>
                  )}
                </>
              }
              actions={
                <>
                  {exam.live_count > 0 && (
                    <Button href={`/live/exams/${exam.id}/candidates`} icon="live">
                      Watch live
                    </Button>
                  )}
                  <Button href={`/exams/${exam.id}/report`} icon="report">
                    Report
                  </Button>
                  <Button icon="settings" onClick={() => setEdit(true)}>
                    Edit
                  </Button>
                </>
              }
            />
            <div className="ps-stats">
              <StatCard label="Candidates" value={exam.candidate_count} />
              <StatCard label="Sessions" value={exam.session_count} hint={`${exam.completed_count} completed`} />
              <StatCard label="Needs review" value={exam.awaiting_review_count} tone={exam.awaiting_review_count ? 'warning' : 'default'} />
              <StatCard label="Integrity concerns" value={exam.flagged_count} tone={exam.flagged_count ? 'danger' : 'default'} />
              <StatCard label="Avg. duration" value={formatDuration(exam.avg_duration_seconds ?? null)} hint={`${exam.violation_count ?? 0} violations total`} />
            </div>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'sessions', label: 'Candidates & sessions', count: exam.session_count },
                { id: 'links', label: 'Candidate links' },
                { id: 'report', label: 'Report' },
                { id: 'details', label: 'Integration details' },
              ]}
            />
            {tab === 'report' && (
              <Card
                title="Cumulative report"
                description="Summary, severe offenders, and async CSV/Excel/PDF exports."
                actions={
                  <Button href={`/exams/${exam.id}/report`} variant="primary" icon="report">
                    Open full report
                  </Button>
                }
              >
                <p className="ps-muted" style={{ margin: 0 }}>
                  Reports read pre-aggregated counters when available. Exports run as background jobs so 100k-row
                  workbooks never block the UI.
                </p>
              </Card>
            )}
            {tab === 'sessions' && (
              <Card>
                <SessionsTable
                  examId={exam.id}
                  showExam={false}
                  refreshMs={exam.live_count > 0 ? 10_000 : undefined}
                  emptyTitle="No candidates yet"
                  emptyDescription="Candidates appear here when your platform starts a session for this exam or a candidate uses one of its links."
                />
              </Card>
            )}
            {tab === 'links' && (
              <Card>
                <AccessLinksPanel examId={exam.id} examTitle={exam.title} />
              </Card>
            )}
            {tab === 'details' && (
              <div className="ps-grid ps-grid-main">
                <Card title="Start a session from your platform" description="Server-to-server; keep the API key on your backend.">
                  <pre className="ps-code">{snippet}</pre>
                  <p className="ps-muted" style={{ marginBottom: 0 }}>
                    The response includes a short-lived <code>launch_url</code> — redirect the candidate to it. Sessions
                    created with this exam&apos;s external ID are grouped here automatically.
                  </p>
                </Card>
                <Card title="Details">
                  <KeyValue
                    items={[
                      { label: 'Exam ID', value: <span className="ps-mono">{exam.id}</span> },
                      { label: 'External exam ID', value: exam.external_exam_id || '—' },
                      { label: 'Created', value: formatDateTime(exam.created_at) },
                      { label: 'Source', value: exam.source },
                      { label: 'Last session', value: formatDateTime(exam.last_session_at) },
                    ]}
                  />
                </Card>
              </div>
            )}
            <ExamFormModal
              open={edit}
              exam={exam}
              onClose={() => setEdit(false)}
              onSaved={() => {
                setEdit(false);
                load();
              }}
            />
          </>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
