import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  listSessions,
  listLiveSessions,
  getSessionDetail,
  terminateSession,
  listSnapshots,
  assertSessionBelongs,
} from '../../services/tenant/sessions.js';
import { buildRecordingSignedUrl, buildSessionReportSignedUrl } from '../../services/tenant/sdk.js';
import {
  pauseSession,
  resumeSession,
  extendSession,
  annotateSession,
  listSessionExtensions,
} from '../../services/tenant/sessionControl.js';
import { listSessionChatMessages, postProctorChatMessage, broadcastChat } from '../../services/tenant/chat.js';
import { listSessionFaceChecks } from '../../services/tenant/recording.js';
import { listSessionRecordingsForPlayback } from '../../services/tenant/recordingMerge.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';

const router = Router();

function actorFromCtx(ctx) {
  if (!ctx) return null;
  return ctx.authMode === 'jwt'
    ? { type: 'tenant_user', id: ctx.userId, email: ctx.email }
    : { type: 'api_key', id: ctx.tenantSlug };
}

function badId(res, label = 'session') {
  return res.status(400).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.validation,
      title: 'Validation Error',
      status: 400,
      detail: `Invalid ${label} id`,
    })
  );
}

function notFound(res, label = 'Session') {
  return res.status(404).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.notFound,
      title: 'Not Found',
      status: 404,
      detail: `${label} not found`,
    })
  );
}

router.get(
  '/live',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listLiveSessions(req.tenantContext.tenantId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    res.json({ data: items, next_cursor });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listSessions(req.tenantContext.tenantId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
      exam_id: req.query.exam_id,
    });
    res.json({ data: items, next_cursor });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const detail = await getSessionDetail(req.tenantContext.tenantId, req.params.id);
    if (!detail) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Session not found',
        })
      );
    }
    res.json({ data: detail });
  })
);

router.get(
  '/:id/recording',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Session not found',
        })
      );
    }
    const url = buildRecordingSignedUrl(req.tenantContext.tenantId, req.params.id);
    const expiresAt = new Date(Date.now() + (parseInt(process.env.SIGNED_LINK_TTL_SECONDS || '900', 10) || 900) * 1000);
    res.json({
      data: {
        recording_url: url,
        expires_at: expiresAt.toISOString(),
        format: 'hls',
      },
    });
  })
);

router.get(
  '/:id/snapshots',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Session not found',
        })
      );
    }
    const items = await listSnapshots(req.tenantContext.tenantId, req.params.id);
    res.json({ data: items });
  })
);

router.get(
  '/:id/report',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Session not found',
        })
      );
    }
    const url = buildSessionReportSignedUrl(req.tenantContext.tenantId, req.params.id);
    const expiresAt = new Date(Date.now() + (parseInt(process.env.SIGNED_LINK_TTL_SECONDS || '900', 10) || 900) * 1000);
    res.json({
      data: {
        report_url: url,
        expires_at: expiresAt.toISOString(),
        format: 'pdf',
      },
    });
  })
);

router.post(
  '/:id/terminate',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const result = await terminateSession(req.tenantContext.tenantId, req.params.id);
    if (result.notFound) return notFound(res);
    if (result.alreadyClosed) {
      return res.status(409).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.conflict,
          title: 'Conflict',
          status: 409,
          detail: 'Session is already completed or terminated.',
        })
      );
    }
    broadcastChat(req.params.id, { type: 'session_terminated', sender: 'system', message: 'Session terminated by proctor' });
    res.json({ data: result.session });
  })
);

router.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const result = await pauseSession(
      req.tenantContext.tenantId,
      req.params.id,
      req.body || {},
      actorFromCtx(req.tenantContext)
    );
    if (result.notFound) return notFound(res);
    if (result.invalid) {
      return res.status(409).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.conflict,
          title: 'Conflict',
          status: 409,
          detail: `Cannot pause session in status: ${result.status}`,
        })
      );
    }
    broadcastChat(req.params.id, { type: 'session_paused', sender: 'system', message: 'Exam paused by proctor' });
    res.json({ data: result.session });
  })
);

router.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const result = await resumeSession(
      req.tenantContext.tenantId,
      req.params.id,
      req.body || {},
      actorFromCtx(req.tenantContext)
    );
    if (result.notFound) return notFound(res);
    if (result.invalid) {
      return res.status(409).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.conflict,
          title: 'Conflict',
          status: 409,
          detail: `Cannot resume session in status: ${result.status}`,
        })
      );
    }
    broadcastChat(req.params.id, { type: 'session_resumed', sender: 'system', message: 'Exam resumed by proctor' });
    res.json({ data: result.session });
  })
);

router.post(
  '/:id/extend',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const result = await extendSession(
        req.tenantContext.tenantId,
        req.params.id,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
      if (result.notFound) return notFound(res);
      broadcastChat(req.params.id, {
        type: 'session_extended',
        sender: 'system',
        message: `Time extended by ${req.body?.extra_seconds || 0}s`,
      });
      res.json({ data: result.session });
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

router.post(
  '/:id/annotations',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const result = await annotateSession(
        req.tenantContext.tenantId,
        req.params.id,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
      if (result.notFound) return notFound(res);
      res.json({ data: result.session });
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

router.get(
  '/:id/extensions',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await listSessionExtensions(req.tenantContext.tenantId, req.params.id);
    res.json({ data });
  })
);

router.get(
  '/:id/chat',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await listSessionChatMessages(req.tenantContext.tenantId, req.params.id, {
      limit: req.query.limit,
    });
    res.json({ data });
  })
);

router.post(
  '/:id/chat',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    try {
      const data = await postProctorChatMessage(
        req.tenantContext.tenantId,
        req.params.id,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
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

router.get(
  '/:id/face-checks',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await listSessionFaceChecks(req.tenantContext.tenantId, req.params.id, {
      limit: req.query.limit,
    });
    res.json({ data });
  })
);

router.get(
  '/:id/recordings',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await listSessionRecordingsForPlayback(req.tenantContext.tenantId, req.params.id);
    res.json({ data });
  })
);

export default router;
