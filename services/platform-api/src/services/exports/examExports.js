import fs from 'fs';
import path from 'path';
import { query } from '../../config/database.js';
import { listSessionsEnriched } from '../tenant/sessionQueries.js';
import { getExamAggregate, refreshExamAggregate } from '../aggregates/examAggregates.js';
import { getExam } from '../tenant/exams.js';
import { violationSqlPredicate } from '../events/violationCatalog.js';
import { writeAuditLog } from '../auditLogWriter.js';
import { laneDecision } from '../queue/lanes.js';
import { getTenantLoadLevel } from '../capacity/loadLevelStore.js';
import { abs, ensureDir } from '../../storage/localStorage.js';

const FEATURE_EXPORTS = String(process.env.FEATURE_EXPORTS || '1') !== '0';
const MAX_OPEN = 5;
const runners = new Set();
const SEVERE_RISK_MIN = 20;

export function exportsEnabled() {
  return FEATURE_EXPORTS;
}

export function publicExportJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    exam_id: row.exam_id,
    kind: row.kind,
    scope: row.scope,
    status: row.status,
    progress: row.progress,
    error: row.error,
    created_at: row.created_at,
    finished_at: row.finished_at,
    meta: row.meta,
  };
}

export function exportFileAbsPath(job) {
  if (!job?.file_path) return null;
  return abs(job.file_path);
}

export function exportDownloadMime(kind) {
  if (kind === 'csv') return 'text/csv; charset=utf-8';
  if (kind === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (kind === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export function exportDownloadFilename(examId, kind) {
  const ext = kind === 'csv' ? 'csv' : kind === 'xlsx' ? 'xlsx' : 'pdf';
  return `exam-${examId}.${ext}`;
}

export async function listExportJobs(tenantId, examId) {
  const { rows } = await query(
    `SELECT * FROM export_jobs WHERE tenant_id = $1 AND exam_id = $2 ORDER BY created_at DESC LIMIT 50`,
    [tenantId, examId]
  );
  return rows.map(publicExportJob);
}

export async function getExportJob(tenantId, examId, jobId) {
  const { rows } = await query(
    `SELECT * FROM export_jobs WHERE id = $1 AND tenant_id = $2 AND exam_id = $3`,
    [jobId, tenantId, examId]
  );
  return rows[0] || null;
}

export async function createExportJob(tenantId, examId, body, actor) {
  const lane = laneDecision('export.csv', { loadLevel: getTenantLoadLevel(tenantId) });
  if (!lane.allow) {
    const e = new Error(`Export deferred under load (${lane.lane})`);
    e.status = 503;
    throw e;
  }
  if (!FEATURE_EXPORTS) {
    const e = new Error('Exports disabled');
    e.status = 503;
    throw e;
  }
  const kind = String(body.kind || 'csv').toLowerCase();
  if (!['csv', 'xlsx', 'pdf'].includes(kind)) {
    const e = new Error('kind must be csv|xlsx|pdf');
    e.status = 422;
    throw e;
  }
  const scope = String(body.scope || 'all');
  const selectedIds = Array.isArray(body.session_ids) ? body.session_ids : [];
  if (scope === 'selected' && !selectedIds.length) {
    const e = new Error('session_ids required for selected scope');
    e.status = 422;
    throw e;
  }
  const { rows: open } = await query(
    `SELECT count(*)::int AS n FROM export_jobs WHERE tenant_id = $1 AND status IN ('queued','running')`,
    [tenantId]
  );
  if ((open[0]?.n || 0) >= MAX_OPEN) {
    const e = new Error('Too many open export jobs');
    e.status = 429;
    throw e;
  }
  const { rows } = await query(
    `INSERT INTO export_jobs (tenant_id, exam_id, kind, scope, filters, status, created_by, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb,'queued',$6,$7::jsonb)
     RETURNING *`,
    [
      tenantId,
      examId,
      kind,
      scope,
      JSON.stringify(body.filters || {}),
      actor || null,
      JSON.stringify({
        generated_by: actor || 'system',
        session_ids: body.session_ids || null,
      }),
    ]
  );
  const job = rows[0];
  await writeAuditLog({
    tenantId,
    actorType: actor ? 'tenant_admin' : 'system',
    actorId: actor || 'system',
    action: 'export.created',
    resourceType: 'export_job',
    resourceId: job.id,
    details: { exam_id: examId, kind, scope, filters: body.filters || {} },
  }).catch(() => {});
  setImmediate(() => void runExportJob(job.id));
  return job;
}

export async function auditExportDownload(tenantId, job, actorContext = {}) {
  if (!job) return;
  const actorId = actorContext.userId || actorContext.tenantId || 'unknown';
  const actorType = actorContext.authMode === 'jwt' ? 'tenant_admin' : actorContext.authMode === 'api_key' ? 'tenant_api_key' : 'system';
  await writeAuditLog({
    tenantId,
    actorType,
    actorId: String(actorId),
    action: 'export.downloaded',
    resourceType: 'export_job',
    resourceId: job.id,
    details: { exam_id: job.exam_id, kind: job.kind, file_path: job.file_path },
  }).catch(() => {});
}

function csvEscape(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function loadExamExportContext(job) {
  const exam = await getExam(job.tenant_id, job.exam_id);
  let agg = await getExamAggregate(job.exam_id);
  if (!agg) {
    try {
      agg = await refreshExamAggregate(job.exam_id, { updateRisk: false });
    } catch {
      agg = null;
    }
  }
  return { exam, agg };
}

async function* iterateSessionPages(tenantId, baseFilters) {
  let cursor = null;
  for (;;) {
    const page = await listSessionsEnriched(tenantId, { ...baseFilters, limit: 100, cursor });
    yield page;
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
}

async function runCsvExport(job, rel) {
  const header =
    '\uFEFFid,candidate_name,candidate_email,status,review_status,review_decision,violation_count,high_severity_count,risk_score,highest_severity,started_at,ended_at\n';
  const stream = fs.createWriteStream(abs(rel), { encoding: 'utf8' });
  stream.write(header);

  let written = 0;
  for await (const page of iterateSessionPages(job.tenant_id, { exam_id: job.exam_id, ...(job.filters || {}) })) {
    for (const s of page.items) {
      stream.write(
        [
          s.id,
          s.candidate_name,
          s.candidate_email,
          s.status,
          s.review_status,
          s.review_decision,
          s.violation_count,
          s.high_severity_count,
          s.risk_score,
          s.highest_severity,
          s.started_at,
          s.ended_at,
        ]
          .map(csvEscape)
          .join(',') + '\n'
      );
      written += 1;
    }
    const progress = Math.min(95, 5 + written);
    await query(`UPDATE export_jobs SET progress = $2, heartbeat_at = now() WHERE id = $1`, [job.id, progress]);
  }
  await new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.on('error', reject);
  });
  return { rows: written, full_list_in: 'csv' };
}

async function runXlsxExport(job, rel) {
  const { default: ExcelJS } = await import('exceljs');
  const filePath = abs(rel);
  ensureDir(path.dirname(filePath));
  const { exam, agg } = await loadExamExportContext(job);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: false,
    useSharedStrings: true,
  });

  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Exam', exam?.title || job.exam_id]).commit();
  summary.addRow(['External ID', exam?.external_exam_id || '']).commit();
  summary.addRow(['Generated', new Date().toISOString()]).commit();
  summary.addRow([]).commit();
  if (agg) {
    summary.addRow(['Metric', 'Value']).commit();
    for (const [k, v] of Object.entries({
      total_candidates: agg.total_candidates,
      appeared: agg.appeared,
      submitted: agg.submitted,
      terminated: agg.terminated,
      total_violations: agg.total_violations,
      avg_risk_score: agg.avg_risk_score,
      flagged_count: agg.flagged_count,
      critical_violation_count: agg.critical_violation_count,
    })) {
      summary.addRow([k, v]).commit();
    }
  }
  summary.addRow([]).commit();
  summary.addRow(['Note', 'Full candidate and violation detail is on the other sheets.']).commit();
  await summary.commit();

  const candidates = workbook.addWorksheet('Candidates');
  candidates
    .addRow([
      'id',
      'candidate_name',
      'email',
      'status',
      'review_status',
      'review_decision',
      'violations',
      'high_severity',
      'risk_score',
      'highest_severity',
      'started_at',
      'ended_at',
    ])
    .commit();

  let written = 0;
  for await (const page of iterateSessionPages(job.tenant_id, { exam_id: job.exam_id, ...(job.filters || {}) })) {
    for (const s of page.items) {
      candidates
        .addRow([
          s.id,
          s.candidate_name,
          s.candidate_email,
          s.status,
          s.review_status,
          s.review_decision,
          s.violation_count,
          s.high_severity_count,
          s.risk_score,
          s.highest_severity,
          s.started_at,
          s.ended_at,
        ])
        .commit();
      written += 1;
    }
    await query(`UPDATE export_jobs SET progress = $2, heartbeat_at = now() WHERE id = $1`, [
      job.id,
      Math.min(80, 10 + written),
    ]);
  }
  await candidates.commit();

  const severe = workbook.addWorksheet('Severe');
  severe.addRow(['id', 'candidate_name', 'risk_score', 'highest_severity', 'violations', 'review_decision']).commit();
  let severeCount = 0;
  for await (const page of iterateSessionPages(job.tenant_id, {
    exam_id: job.exam_id,
    ...(job.filters || {}),
    sort: 'risk',
    min_risk: SEVERE_RISK_MIN,
  })) {
    for (const s of page.items) {
      const hi =
        s.highest_severity &&
        ['CRITICAL', 'HIGH', 'FLAG'].includes(String(s.highest_severity).toUpperCase());
      if (!hi && Number(s.risk_score || 0) < SEVERE_RISK_MIN) continue;
      severe
        .addRow([s.id, s.candidate_name, s.risk_score, s.highest_severity, s.violation_count, s.review_decision])
        .commit();
      severeCount += 1;
      if (severeCount >= 500) break;
    }
    if (severeCount >= 500) break;
  }
  await severe.commit();

  const violations = workbook.addWorksheet('Violations');
  violations.addRow(['session_id', 'candidate_name', 'event_type', 'severity', 'occurred_at', 'review_status']).commit();
  const vio = violationSqlPredicate('se');
  let vioRows = 0;
  const { rows: vioEvents } = await query(
    `SELECT se.session_id, se.event_type, se.severity, se.occurred_at, se.review_status,
            COALESCE(NULLIF(trim(s.candidate_name), ''), c.name, s.id::text) AS candidate_name
     FROM session_events se
     JOIN exam_sessions s ON s.id = se.session_id
     LEFT JOIN candidates c ON c.id = s.candidate_id
     WHERE s.exam_id = $1 AND s.tenant_id = $2 AND ${vio}
       AND COALESCE(se.review_status,'open') <> 'dismissed'
     ORDER BY se.occurred_at DESC
     LIMIT 50000`,
    [job.exam_id, job.tenant_id]
  );
  for (const row of vioEvents) {
    violations
      .addRow([row.session_id, row.candidate_name, row.event_type, row.severity, row.occurred_at, row.review_status])
      .commit();
    vioRows += 1;
  }
  await violations.commit();

  await workbook.commit();
  await query(`UPDATE export_jobs SET progress = 98, heartbeat_at = now() WHERE id = $1`, [job.id]);
  return {
    rows: written,
    severe_rows: severeCount,
    violation_rows: vioRows,
    sheets: ['Summary', 'Candidates', 'Severe', 'Violations'],
    full_list_in: 'xlsx',
  };
}

async function runPdfExport(job, rel) {
  const PDFDocument = (await import('pdfkit')).default;
  const filePath = abs(rel);
  ensureDir(path.dirname(filePath));
  const { exam, agg } = await loadExamExportContext(job);

  const vio = violationSqlPredicate('se');
  const { rows: severeRows } = await query(
    `SELECT s.id,
            COALESCE(NULLIF(trim(s.candidate_name), ''), c.name, s.external_ref, s.id::text) AS candidate_name,
            s.risk_score, s.highest_severity, s.review_decision,
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
  );

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const out = fs.createWriteStream(filePath);
    doc.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    doc.on('error', reject);

    doc.fontSize(18).text('Exam proctoring report', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Exam: ${exam?.title || job.exam_id}`);
    if (exam?.external_exam_id) doc.text(`External ID: ${exam.external_exam_id}`);
    doc.text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();

    doc.fontSize(14).text('Summary', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    if (agg) {
      doc.text(`Candidates: ${agg.total_candidates ?? 0}`);
      doc.text(`Appeared: ${agg.appeared ?? 0} · Submitted: ${agg.submitted ?? 0} · Terminated: ${agg.terminated ?? 0}`);
      doc.text(`Violations: ${agg.total_violations ?? 0} · Critical: ${agg.critical_violation_count ?? 0}`);
      doc.text(`Avg risk: ${agg.avg_risk_score != null ? Math.round(Number(agg.avg_risk_score)) : '—'}`);
      doc.text(`Review pending: ${agg.review_pending ?? 0}`);
    } else {
      doc.text('Aggregate stats unavailable.');
    }
    doc.moveDown();
    doc.fontSize(10).fillColor('#555').text('Full candidate and violation lists are available in Excel or CSV exports.');
    doc.fillColor('#000');
    doc.moveDown();

    doc.fontSize(14).text('Top severe candidates', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    if (!severeRows.length) {
      doc.text('No severe cases recorded.');
    } else {
      for (const r of severeRows) {
        doc.text(
          `• ${r.candidate_name} — risk ${Math.round(Number(r.risk_score || 0))}, ${r.highest_severity || '—'}, ${r.violation_count ?? 0} violations, decision ${r.review_decision || '—'}`
        );
      }
    }
    doc.end();
  });

  return {
    severe_limit: 40,
    severe_rows: severeRows.length,
    full_list_in: 'xlsx_or_csv',
    note: 'PDF contains summary and top severe candidates only.',
  };
}

function jobFileRel(job) {
  const ext = job.kind === 'csv' ? 'csv' : job.kind === 'xlsx' ? 'xlsx' : 'pdf';
  return `exports/${job.tenant_id}/${job.exam_id}/${job.id}.${ext}`;
}

async function runExportJob(jobId) {
  if (runners.has(jobId)) return;
  runners.add(jobId);
  try {
    const { rows } = await query(`SELECT * FROM export_jobs WHERE id = $1`, [jobId]);
    const job = rows[0];
    if (!job || job.status !== 'queued') return;
    await query(`UPDATE export_jobs SET status = 'running', heartbeat_at = now(), progress = 1 WHERE id = $1`, [jobId]);

    const rel = jobFileRel(job);
    ensureDir(path.dirname(abs(rel)));

    let meta = {};
    if (job.kind === 'csv') {
      meta = await runCsvExport(job, rel);
    } else if (job.kind === 'xlsx') {
      meta = await runXlsxExport(job, rel);
    } else if (job.kind === 'pdf') {
      meta = await runPdfExport(job, rel);
    } else {
      throw new Error(`Unsupported export kind: ${job.kind}`);
    }

    await query(
      `UPDATE export_jobs SET status = 'done', progress = 100, file_path = $2, finished_at = now(), heartbeat_at = now(),
       meta = meta || $3::jsonb WHERE id = $1`,
      [jobId, rel, JSON.stringify({ ...meta, generated_at: new Date().toISOString(), exam_id: job.exam_id })]
    );
  } catch (err) {
    await query(
      `UPDATE export_jobs SET status = 'failed', error = $2, finished_at = now(), heartbeat_at = now() WHERE id = $1`,
      [jobId, String(err.message || err)]
    );
  } finally {
    runners.delete(jobId);
  }
}

export async function resumeQueuedExports() {
  const { rows } = await query(`SELECT id FROM export_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 20`);
  for (const r of rows) setImmediate(() => void runExportJob(r.id));
  await query(
    `UPDATE export_jobs SET status = 'failed', error = 'Interrupted runner', finished_at = now()
     WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '2 minutes')`
  );
}
