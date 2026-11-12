import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { isUuid } from '../../utils/validation.js';
import { getExam } from '../../services/tenant/exams.js';
import { getOrCreateExamLockdownPolicy, putExamLockdownPolicy } from '../../services/lockdown/policyStore.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';

/**
 * Mounted at /v1/exams — only lockdown-policy paths so other exam routes stay in exams.routes.js.
 * Both routers are mounted on /exams; Express merges matching routes.
 */
const router = Router();

router.get(
  '/:examId/lockdown-policy',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid exam id' })
      );
    }
    const exam = await getExam(req.tenantContext.tenantId, req.params.examId);
    if (!exam) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Exam not found' })
      );
    }
    const signed = await getOrCreateExamLockdownPolicy(req.tenantContext.tenantId, req.params.examId);
    res.json({ data: signed });
  })
);

router.put(
  '/:examId/lockdown-policy',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid exam id' })
      );
    }
    const exam = await getExam(req.tenantContext.tenantId, req.params.examId);
    if (!exam) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Exam not found' })
      );
    }
    const signed = await putExamLockdownPolicy(req.tenantContext.tenantId, req.params.examId, req.body?.policy || req.body || {});
    res.json({ data: signed });
  })
);

export default router;
