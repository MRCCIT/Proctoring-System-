import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listExams, createExam, listSessionsForExam } from '../../services/tenant/exams.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listExams(req.tenantContext.tenantId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    res.json({ data: items, next_cursor });
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
  '/:examId/sessions',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid exam id',
        })
      );
    }
    const result = await listSessionsForExam(req.tenantContext.tenantId, req.params.examId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    if (!result) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Exam not found',
        })
      );
    }
    res.json({ data: result.items, next_cursor: result.next_cursor });
  })
);

export default router;
