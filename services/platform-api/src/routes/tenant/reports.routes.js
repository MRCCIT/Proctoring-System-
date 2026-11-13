import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  getExamReport,
  getCandidateReport,
  getAttendanceReport,
  rowsToCsv,
} from '../../services/tenant/reports.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';

const router = Router();

function badId(res, label) {
  return res.status(400).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.validation,
      title: 'Validation Error',
      status: 400,
      detail: `Invalid ${label} id`,
    })
  );
}

router.get(
  '/exam/:examId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res, 'exam');
    const report = await getExamReport(req.tenantContext.tenantId, req.params.examId);
    if (!report) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Exam not found' })
      );
    }
    res.json({ data: report });
  })
);

router.get(
  '/candidate/:candidateId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.candidateId)) return badId(res, 'candidate');
    const report = await getCandidateReport(req.tenantContext.tenantId, req.params.candidateId);
    if (!report) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Candidate not found' })
      );
    }
    res.json({ data: report });
  })
);

router.get(
  '/exam/:examId/attendance',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) return badId(res, 'exam');
    const report = await getAttendanceReport(req.tenantContext.tenantId, req.params.examId);
    if (!report) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Exam not found' })
      );
    }
    if (req.query.format === 'csv') {
      const csv = rowsToCsv(report.candidates, [
        { key: 'session_id', label: 'Session ID' },
        { key: 'candidate_id', label: 'Candidate ID' },
        { key: 'name', label: 'Candidate' },
        { key: 'email', label: 'Email' },
        { key: 'external_ref', label: 'External Ref' },
        { key: 'status', label: 'Status' },
        { key: 'review_status', label: 'Review Status' },
        { key: 'review_decision', label: 'Review Decision' },
        { key: 'violation_count', label: 'Violations' },
        { key: 'high_severity_count', label: 'High Severity' },
        { key: 'risk_score', label: 'Risk Score' },
        { key: 'highest_severity', label: 'Highest Severity' },
        { key: 'started_at', label: 'Started At' },
        { key: 'ended_at', label: 'Ended At' },
      ]);
      res.type('text/csv').send(csv);
      return;
    }
    res.json({ data: report });
  })
);

export default router;
