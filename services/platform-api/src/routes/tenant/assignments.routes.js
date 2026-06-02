import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import {
  listProctorAssignments,
  assignProctor,
  removeProctorAssignment,
} from '../../services/tenant/sessionControl.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await listProctorAssignments(req.tenantContext.tenantId, {
      examId: req.query.exam_id,
      sessionId: req.query.session_id,
      proctorUserId: req.query.proctor_user_id,
    });
    res.json({ data });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const data = await assignProctor(req.tenantContext.tenantId, req.body || {});
      res.status(201).json({ data });
    } catch (e) {
      if (e.status === 422) {
        return res.status(422).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 422, detail: e.message })
        );
      }
      throw e;
    }
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid assignment id',
        })
      );
    }
    const ok = await removeProctorAssignment(req.tenantContext.tenantId, req.params.id);
    if (!ok) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Assignment not found',
        })
      );
    }
    res.status(204).end();
  })
);

export default router;
