import PDFDocument from 'pdfkit';
import { query } from '../../config/database.js';
import { getExam } from '../tenant/exams.js';
import { getExamAggregate, refreshExamAggregate } from '../aggregates/examAggregates.js';
import { getBranding } from '../tenant/branding.js';
import { violationSqlPredicate } from '../events/violationCatalog.js';
import {
  COLORS,
  drawCoverHeader,
  drawDisclaimer,
  drawFooter,
  drawKeyValueGrid,
  drawKpiRow,
  drawSectionTitle,
  drawTable,
  formatWhen,
} from './pdfTheme.js';

const SEVERE_RISK_MIN = 20;

/**
 * Write a polished exam-level integrity PDF to an absolute file path.
 */
export async function writeExamIntegrityPdf(job, filePath) {
  const exam = await getExam(job.tenant_id, job.exam_id);
  let agg = await getExamAggregate(job.exam_id);
  if (!agg) {
    try {
      agg = await refreshExamAggregate(job.exam_id, { updateRisk: false });
    } catch {
      agg = null;
    }
  }
  const branding = await getBranding(job.tenant_id).catch(() => null);
  const accent = branding?.primary_color || COLORS.brand;
  const org = branding?.organization_name || 'Organization';

  const vio = violationSqlPredicate('se');
  const [{ rows: severeRows }, { rows: topSignals }, { rows: candidates }] = await Promise.all([
    query(
      `SELECT s.id,
              COALESCE(NULLIF(trim(s.candidate_name), ''), c.name, s.external_ref, s.id::text) AS candidate_name,
              s.risk_score, s.highest_severity, s.review_decision, s.review_status, s.status,
              (SELECT count(*)::int FROM session_events se WHERE se.session_id = s.id AND ${vio}
                 AND COALESCE(se.review_status,'open') <> 'dismissed') AS violation_count
       FROM exam_sessions s
       LEFT JOIN candidates c ON c.id = s.candidate_id
       WHERE s.exam_id = $1 AND s.tenant_id = $2
         AND (
           upper(COALESCE(s.highest_severity,'')) IN ('CRITICAL','HIGH','FLAG')
           OR COALESCE(s.risk_score,0) >= ${SEVERE_RISK_MIN}
         )
       ORDER BY COALESCE(s.risk_score,0) DESC, s.id
       LIMIT 40`,
      [job.exam_id, job.tenant_id]
    ),
    query(
      `SELECT se.event_type AS code,
              count(*)::int AS total,
              count(*) FILTER (WHERE upper(COALESCE(se.severity,'')) IN ('CRITICAL','HIGH','FLAG'))::int AS high
         FROM session_events se
         JOIN exam_sessions s ON s.id = se.session_id
        WHERE s.exam_id = $1 AND s.tenant_id = $2 AND ${vio}
        GROUP BY se.event_type
        ORDER BY total DESC
        LIMIT 12`,
      [job.exam_id, job.tenant_id]
    ),
    query(
      `SELECT COALESCE(NULLIF(trim(s.candidate_name), ''), c.name, s.external_ref, s.id::text) AS candidate_name,
              s.status, s.review_status, s.review_decision, s.risk_score, s.highest_severity,
              (SELECT count(*)::int FROM session_events se WHERE se.session_id = s.id AND ${vio}
                 AND COALESCE(se.review_status,'open') <> 'dismissed') AS violation_count
         FROM exam_sessions s
         LEFT JOIN candidates c ON c.id = s.candidate_id
        WHERE s.exam_id = $1 AND s.tenant_id = $2
        ORDER BY s.created_at DESC
        LIMIT 60`,
      [job.exam_id, job.tenant_id]
    ),
  ]);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 52, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: `Exam report — ${exam?.title || job.exam_id}`,
      Author: 'ProctorShield',
    },
  });

  const fs = await import('fs');
  const out = fs.createWriteStream(filePath);
  const finished = new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    doc.on('error', reject);
  });
  doc.pipe(out);

  let y = drawCoverHeader(doc, {
    orgName: org,
    title: 'Exam integrity report',
    subtitle: exam?.title || String(job.exam_id),
    accent,
    generatedAt: new Date().toISOString(),
  });

  y = drawSectionTitle(doc, y, 'Exam details');
  y = drawKeyValueGrid(doc, y, [
    { label: 'Exam', value: exam?.title || '—' },
    { label: 'External ID', value: exam?.external_exam_id || '—' },
    { label: 'Exam ID', value: job.exam_id },
    { label: 'Export scope', value: job.scope || 'all' },
  ]);

  y = drawSectionTitle(doc, y + 4, 'Integrity summary');
  y = drawKpiRow(
    doc,
    y,
    [
      { label: 'Candidates', value: agg?.total_candidates ?? 0 },
      { label: 'Appeared', value: agg?.appeared ?? 0 },
      { label: 'Absent', value: agg?.absent ?? 0 },
      { label: 'Submitted', value: agg?.submitted ?? 0 },
      { label: 'Terminated', value: agg?.terminated ?? 0 },
      {
        label: 'Violations',
        value: agg?.total_violations ?? 0,
        tone: agg?.total_violations ? 'danger' : 'ok',
      },
      {
        label: 'Critical',
        value: agg?.critical_violation_count ?? 0,
        tone: agg?.critical_violation_count ? 'danger' : undefined,
      },
      {
        label: 'Review pending',
        value: agg?.review_pending ?? 0,
        tone: agg?.review_pending ? 'warn' : undefined,
      },
      {
        label: 'Avg risk',
        value: agg?.avg_risk_score != null ? Math.round(Number(agg.avg_risk_score)) : '—',
      },
    ],
    3
  );

  if (topSignals.length) {
    y = drawSectionTitle(doc, y, 'Top signals');
    y = drawTable(
      doc,
      y,
      ['Signal code', 'Count', 'High / critical'],
      topSignals.map((r) => [r.code, r.total, r.high]),
      [3.5, 1, 1.5]
    );
  }

  if (severeRows.length) {
    y = drawSectionTitle(doc, y, 'Severe candidates');
    y = drawTable(
      doc,
      y,
      ['Candidate', 'Risk', 'Severity', 'Violations', 'Decision'],
      severeRows.map((r) => [
        r.candidate_name,
        Math.round(Number(r.risk_score || 0)),
        r.highest_severity || '—',
        r.violation_count ?? 0,
        r.review_decision || r.review_status || '—',
      ]),
      [2.8, 0.8, 1.1, 1.1, 1.4]
    );
  } else {
    y = drawSectionTitle(doc, y, 'Severe candidates');
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text('No severe cases in this exam.', doc.page.margins.left, y);
    y = doc.y + 14;
  }

  if (candidates.length) {
    y = drawSectionTitle(doc, y, `Candidate roster (latest ${candidates.length})`);
    y = drawTable(
      doc,
      y,
      ['Candidate', 'Status', 'Review', 'Risk', 'Violations'],
      candidates.map((r) => [
        r.candidate_name,
        r.status,
        r.review_decision || r.review_status || '—',
        Math.round(Number(r.risk_score || 0)),
        r.violation_count ?? 0,
      ]),
      [2.6, 1.2, 1.4, 0.8, 1.1]
    );
  }

  y = drawDisclaimer(
    doc,
    y + 4,
    'This export summarizes automated proctoring signals and review outcomes for the exam. ' +
      'Detections are indicators for human judgement — not determinations of misconduct. ' +
      'Full row-level detail is available in the Excel/CSV exports. Assessment scores remain with the assessment platform.'
  );

  drawFooter(doc, `${org} · Exam ${exam?.title || job.exam_id} · ${formatWhen(new Date().toISOString())}`);
  doc.end();
  await finished;

  return {
    severe_limit: 40,
    severe_rows: severeRows.length,
    candidate_rows: candidates.length,
    signal_rows: topSignals.length,
    full_list_in: 'xlsx_or_csv',
    note: 'PDF includes summary, top signals, severe cases, and a candidate roster sample.',
  };
}
