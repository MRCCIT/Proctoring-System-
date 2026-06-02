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
        { key: 'candidate_id', label: 'Candidate ID' },
        { key: 'email', label: 'Email' },
        { key: 'name', label: 'Name' },
        { key: 'external_ref', label: 'External Ref' },
        { key: 'attended', label: 'Attended' },
        { key: 'status', label: 'Status' },
        { key: 'success', label: 'Success' },
        { key: 'started_at', label: 'Started At' },
        { key: 'ended_at', label: 'Ended At' },
        { key: 'violation_flags', label: 'Violations' },
      ]);
      res.type('text/csv').send(csv);
      return;
    }
    res.json({ data: report });
  })
);

export default router;
