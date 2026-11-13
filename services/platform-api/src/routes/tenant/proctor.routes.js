import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import { requireAdminRole } from '../../middleware/tenantPermissions.js';
import {
  listProctorsWithCapacity,
  getExamPool,
  setExamProctorPool,
  listEligibleSessions,
  getProctorSettings,
  updateProctorSettings,
  runAllocation,
  listMyAssignments,
  reassignSession,
} from '../../services/tenant/proctorAssignmentEngine.js';
import { inviteProctor } from '../../services/tenant/tenantUsers.js';

const router = Router();

function handleErr(res, e) {
  const status = e.status || 500;
  if ([400, 403, 404, 409, 422].includes(status)) {
    return res.status(status).type('application/problem+json').json(
      problemDetails({
        type:
          status === 404
            ? ProblemTypes.notFound
            : status === 403
              ? ProblemTypes.forbidden
              : status === 409
                ? ProblemTypes.conflict
                : ProblemTypes.validation,
        title: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Error',
        status,
        detail: e.message,
      })
    );
  }
  throw e;
}

/** Team: list proctors with capacity (admin). */
router.get(
  '/proctors',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const data = await listProctorsWithCapacity(req.tenantContext.tenantId);
    res.json({ data });
  })
);

/** Invite proctor (admin). */
router.post(
  '/proctors/invite',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    try {
      const data = await inviteProctor(req.tenantContext.tenantId, req.body || {});
      res.status(201).json({ data });
    } catch (e) {
      handleErr(res, e);
    }
  })
);

router.get(
  '/settings',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    res.json({ data: await getProctorSettings(req.tenantContext.tenantId) });
  })
);

router.patch(
  '/settings',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    res.json({ data: await updateProctorSettings(req.tenantContext.tenantId, req.body || {}) });
  })
);

/** My dashboard (proctor). */
router.get(
  '/me/assignments',
  asyncHandler(async (req, res) => {
    const user = req.tenantUser;
    if (!user) {
      return res.status(401).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.unauthorized, title: 'Unauthorized', status: 401, detail: 'Login required' })
      );
    }
    const examId = req.query.exam_id && isUuid(req.query.exam_id) ? req.query.exam_id : undefined;
    const data = await listMyAssignments(req.tenantContext.tenantId, user.id, { examId });
    const summary = {
      total: data.length,
      critical: data.filter((d) => d.risk_band === 'critical').length,
      high: data.filter((d) => d.risk_band === 'high').length,
      medium: data.filter((d) => d.risk_band === 'medium').length,
      live: data.filter((d) => d.session_status === 'active').length,
    };
    res.json({ data, summary });
  })
);

router.get(
  '/exams/:examId/pool',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid exam id' })
      );
    }
    const [pool, settings, eligible] = await Promise.all([
      getExamPool(req.tenantContext.tenantId, req.params.examId),
      getProctorSettings(req.tenantContext.tenantId),
      listEligibleSessions(req.tenantContext.tenantId, req.params.examId, await getProctorSettings(req.tenantContext.tenantId)),
    ]);
    res.json({
      data: {
        pool,
        settings,
        eligible_count: eligible.length,
        risk_distribution: {
          critical: eligible.filter((x) => x.risk_band === 'critical').length,
          high: eligible.filter((x) => x.risk_band === 'high').length,
          medium: eligible.filter((x) => x.risk_band === 'medium').length,
          low: eligible.filter((x) => x.risk_band === 'low').length,
        },
      },
    });
  })
);

router.put(
  '/exams/:examId/pool',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid exam id' })
      );
    }
    try {
      const data = await setExamProctorPool(req.tenantContext.tenantId, req.params.examId, {
        ...(req.body || {}),
        created_by: req.tenantUser?.id,
      });
      res.json({ data });
    } catch (e) {
      handleErr(res, e);
    }
  })
);

router.post(
  '/exams/:examId/allocate',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.examId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid exam id' })
      );
    }
    try {
      const body = req.body || {};
      if (body.proctor_user_ids) {
        await setExamProctorPool(req.tenantContext.tenantId, req.params.examId, {
          proctor_user_ids: body.proctor_user_ids,
          allocation_mode: body.mode || body.allocation_mode,
          auto_allocate: body.auto_allocate !== false,
          created_by: req.tenantUser?.id,
        });
      }
      const result = await runAllocation(req.tenantContext.tenantId, req.params.examId, {
        mode: body.mode || body.allocation_mode,
        actorId: req.tenantUser?.id,
        dry_run: Boolean(body.dry_run || body.preview),
        notify: body.notify !== false,
      });
      res.json({ data: result });
    } catch (e) {
      handleErr(res, e);
    }
  })
);

router.post(
  '/sessions/:sessionId/reassign',
  requireAdminRole,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.sessionId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid session id' })
      );
    }
    const to = req.body?.proctor_user_id;
    if (!to || !isUuid(to)) {
      return res.status(422).type('application/problem+json').json(
        problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 422, detail: 'proctor_user_id required' })
      );
    }
    try {
      const data = await reassignSession(req.tenantContext.tenantId, req.params.sessionId, to, req.tenantUser?.id);
      res.json({ data });
    } catch (e) {
      handleErr(res, e);
    }
  })
);

export default router;
