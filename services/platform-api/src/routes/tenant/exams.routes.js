import fs from 'fs';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listExams, createExam, updateExam, getExamWithStats } from '../../services/tenant/exams.js';
import { listSessionsEnriched } from '../../services/tenant/sessionQueries.js';
import { buildExamReport } from '../../services/tenant/examReport.js';
import {
  createExportJob,
  listExportJobs,
  getExportJob,
  publicExportJob,
  exportFileAbsPath,
  exportsEnabled,
  auditExportDownload,
  exportDownloadMime,
  exportDownloadFilename,
} from '../../services/exports/examExports.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import {
  getExamLoadLevel,
  setExamLoadLevel,
  broadcastLoadLevel,
  policyForLevel,
} from '../../services/capacity/loadLevelStore.js';

const router = Router();

function badId(res, detail = 'Invalid exam id') {
  return res.status(400).type('application/problem+json').json(
    problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail })
  );
}

function notFound(res, detail = 'Exam not found') {
  return res.status(404).type('application/problem+json').json(
    problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail })
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { items, next_cursor, total } = await listExams(req.tenantContext.tenantId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
      q: req.query.q,
    });
    res.json({ data: items, next_cursor, total });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const exam = await createExam(req.tenantContext.tenantId, req.body || {});
    res.status(201).json({ data: exam });
  })
);

router.get(
  '/:examId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const exam = await getExamWithStats(req.tenantContext.tenantId, req.params.examId);
    if (!exam) return notFound(res);
    res.json({ data: exam });
  })
);

router.patch(
  '/:examId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const exam = await updateExam(req.tenantContext.tenantId, req.params.examId, req.body || {});
    if (!exam) return notFound(res);
    res.json({ data: exam });
  })
);

router.get(
  '/:examId/sessions',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const exam = await getExamWithStats(req.tenantContext.tenantId, req.params.examId);
    if (!exam) return notFound(res);
    const { items, next_cursor, total } = await listSessionsEnriched(req.tenantContext.tenantId, {
      exam_id: req.params.examId,
      cursor: req.query.next_cursor,
      limit: req.query.limit,
      q: req.query.q,
      status: req.query.status,
      review_status: req.query.review_status,
      review_decision: req.query.review_decision,
      has_violations: req.query.has_violations,
      sort: req.query.sort,
      highest_severity: req.query.highest_severity,
      min_risk: req.query.min_risk,
      live_only: req.query.live_only,
    });
    res.json({ data: items, next_cursor, total });
  })
);

router.get(
  '/:examId/report',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const report = await buildExamReport(req.tenantContext.tenantId, req.params.examId, {
      severity: req.query.severity,
      violation_type: req.query.violation_type,
      review_status: req.query.review_status,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
      candidate_cursor: req.query.candidate_cursor,
      candidate_limit: req.query.candidate_limit,
      sort: req.query.sort,
    });
    if (!report) return notFound(res);
    res.json({ data: report });
  })
);

router.post(
  '/:examId/exports',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    if (!exportsEnabled()) {
      return res.status(503).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.serviceUnavailable, title: 'Unavailable', status: 503, detail: 'Exports disabled' })
      );
    }
    const exam = await getExamWithStats(req.tenantContext.tenantId, req.params.examId);
    if (!exam) return notFound(res);
    const actor = req.tenantContext.email || req.tenantContext.userId || null;
    const job = await createExportJob(req.tenantContext.tenantId, req.params.examId, req.body || {}, actor);
    res.status(202).json({ data: publicExportJob(job) });
  })
);

router.get(
  '/:examId/exports',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const exam = await getExamWithStats(req.tenantContext.tenantId, req.params.examId);
    if (!exam) return notFound(res);
    const jobs = await listExportJobs(req.tenantContext.tenantId, req.params.examId);
    res.json({ data: jobs });
  })
);

router.get(
  '/:examId/exports/:jobId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId) || !isUuid(req.params.jobId)) return badId(res);
    const job = await getExportJob(req.tenantContext.tenantId, req.params.examId, req.params.jobId);
    if (!job) return notFound(res, 'Export job not found');
    res.json({ data: publicExportJob(job) });
  })
);

router.get(
  '/:examId/exports/:jobId/download',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId) || !isUuid(req.params.jobId)) return badId(res);
    const job = await getExportJob(req.tenantContext.tenantId, req.params.examId, req.params.jobId);
    if (!job) return notFound(res, 'Export job not found');
    if (job.status !== 'done' || !job.file_path) {
      return res.status(409).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.conflict, title: 'Conflict', status: 409, detail: 'Export not ready' })
      );
    }
    const file = exportFileAbsPath(job);
    if (!file || !fs.existsSync(file)) {
      return res.status(410).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Gone', status: 410, detail: 'Export file missing' })
      );
    }
    await auditExportDownload(req.tenantContext.tenantId, job, req.tenantContext);
    res.setHeader('Content-Type', exportDownloadMime(job.kind));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportDownloadFilename(req.params.examId, job.kind)}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.internal,
            title: 'Internal Server Error',
            status: 500,
            detail: 'Failed to read export file',
          })
        );
        return;
      }
      res.destroy();
    });
    stream.pipe(res);
  })
);

router.get(
  '/:examId/load-level',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const level = getExamLoadLevel(req.tenantContext.tenantId, req.params.examId);
    res.json({ data: { level, policy: policyForLevel(level) } });
  })
);

router.put(
  '/:examId/load-level',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res);
    const level = req.body?.level || req.body?.load_level || 'L0';
    const data = setExamLoadLevel(req.tenantContext.tenantId, req.params.examId, level, { manual: true });
    const pushed = await broadcastLoadLevel(req.tenantContext.tenantId, req.params.examId, data.level);
    res.json({ data: { ...data, pushed_to_sessions: pushed } });
  })
);

export default router;
