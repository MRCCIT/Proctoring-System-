import PDFDocument from 'pdfkit';
import { buildIntegrityReport } from '../tenant/review.js';
import { getBranding } from '../tenant/branding.js';
import {
  COLORS,
  drawCoverHeader,
  drawDisclaimer,
  drawFooter,
  drawKeyValueGrid,
  drawKpiRow,
  drawSectionTitle,
  drawTable,
  formatDuration,
  formatOffset,
  formatWhen,
} from './pdfTheme.js';

/**
 * Build a polished single-session integrity PDF as a Buffer.
 */
export async function renderSessionIntegrityPdf(tenantId, sessionId) {
  const report = await buildIntegrityReport(tenantId, sessionId);
  if (!report) return null;
  const branding = await getBranding(tenantId).catch(() => null);
  const accent = branding?.primary_color || COLORS.brand;
  const org = branding?.organization_name || report.organization || 'Organization';

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 52, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: `Integrity report — ${report.candidate?.name || sessionId}`,
      Author: 'ProctorShield',
      Subject: report.exam?.title || 'Proctoring integrity report',
    },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = drawCoverHeader(doc, {
    orgName: org,
    title: 'Session integrity report',
    subtitle: report.exam?.title || 'Proctoring session',
    accent,
    generatedAt: report.generated_at,
  });

  y = drawSectionTitle(doc, y, 'Session overview');
  y = drawKeyValueGrid(doc, y, [
    { label: 'Candidate', value: report.candidate?.name || '—' },
    { label: 'Email', value: report.candidate?.email || '—' },
    { label: 'External ID', value: report.candidate?.external_candidate_id || '—' },
    { label: 'Exam', value: report.exam?.title || '—' },
    { label: 'Started', value: formatWhen(report.session?.started_at) },
    { label: 'Ended', value: formatWhen(report.session?.ended_at) },
    { label: 'Duration', value: formatDuration(report.session?.duration_seconds) },
    { label: 'Session status', value: report.session?.status || '—' },
    { label: 'Review status', value: report.review?.status || '—' },
    {
      label: 'Decision',
      value: report.review?.decision ? String(report.review.decision).replace(/_/g, ' ') : 'Pending',
    },
  ]);

  y += 6;
  y = drawSectionTitle(doc, y, 'Integrity summary');
  y = drawKpiRow(
    doc,
    y,
    [
      { label: 'Violations', value: report.violations?.total ?? 0, tone: report.violations?.total ? 'danger' : 'ok' },
      { label: 'Open', value: report.violations?.open ?? 0, tone: report.violations?.open ? 'warn' : undefined },
      { label: 'Confirmed', value: report.violations?.confirmed ?? 0, tone: report.violations?.confirmed ? 'danger' : undefined },
      { label: 'Dismissed', value: report.violations?.dismissed ?? 0 },
      { label: 'Recordings', value: report.evidence?.recordings?.length ?? 0 },
      { label: 'Snapshots', value: report.evidence?.snapshot_count ?? 0 },
    ],
    3
  );

  if (report.review?.summary) {
    y = drawSectionTitle(doc, y + 4, 'Reviewer summary');
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10);
    doc.text(report.review.summary, doc.page.margins.left, y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
    y = doc.y + 12;
    if (report.review.reviewed_by) {
      doc.fillColor(COLORS.muted).fontSize(8).text(`Reviewed by ${report.review.reviewed_by} · ${formatWhen(report.review.reviewed_at)}`);
      y = doc.y + 10;
    }
  }

  const byType = (report.violations?.by_type || []).slice(0, 15);
  if (byType.length) {
    y = drawSectionTitle(doc, y, 'Violations by type');
    y = drawTable(
      doc,
      y,
      ['Signal', 'Severity', 'Total', 'Open', 'Confirmed', 'Dismissed'],
      byType.map((r) => [r.label || r.code, r.severity, r.total, r.open, r.confirmed, r.dismissed]),
      [3.2, 1.2, 0.9, 0.9, 1.1, 1.1]
    );
  }

  const timeline = (report.timeline || []).slice(0, 80);
  if (timeline.length) {
    y = drawSectionTitle(doc, y, `Detection timeline (${timeline.length}${report.timeline.length > 80 ? '+' : ''})`);
    y = drawTable(
      doc,
      y,
      ['Offset', 'Time', 'Detection', 'Sev', 'Source', 'Review'],
      timeline.map((t) => [
        formatOffset(t.offset_seconds),
        formatWhen(t.occurred_at),
        t.label || t.code,
        t.severity,
        t.source,
        t.review_status,
      ]),
      [0.9, 1.8, 2.6, 0.9, 1, 1]
    );
  }

  if (report.identity) {
    y = drawSectionTitle(doc, y, 'Identity checks');
    const cv = report.identity.continuous_verification || {};
    y = drawKeyValueGrid(doc, y, [
      { label: 'Reference submissions', value: report.identity.reference_submissions ?? 0 },
      { label: 'Face-check samples', value: cv.samples ?? 0 },
      { label: 'Avg match', value: cv.average != null ? Number(cv.average).toFixed(1) : '—' },
      { label: 'Low-match samples', value: cv.low_match_samples ?? 0 },
    ]);
  }

  y = drawDisclaimer(
    doc,
    y + 4,
    report.disclaimer ||
      'Automated detections are indicators for human review. They are not determinations of misconduct. Assessment scores belong to the assessment platform.'
  );

  drawFooter(doc, `${org} · ${report.session?.id || sessionId}`);
  doc.end();
  return done;
}
