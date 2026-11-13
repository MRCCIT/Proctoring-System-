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
import { listSessionsEnriched, listLiveSessionsEnriched } from '../../services/tenant/sessionQueries.js';
import {
  getSessionTimeline,
  getSessionEvidence,
  buildIntegrityReport,
  listReviewHistory,
  startReview,
  decideSession,
  reviewEvent,
  addReviewNote,
  addManualIncident,
} from '../../services/tenant/review.js';
import { ingestLockdownEvents } from '../../services/lockdown/events.js';
import { requireSebWhenStrict } from '../../middleware/sebIntegrity.js';
import { presignMediaChunk, completeMediaChunk } from '../../services/media/chunkPresign.js';
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
import { bulkSessionActions } from '../../services/tenant/bulkSessions.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import { requireSessionAccess } from '../../middleware/tenantPermissions.js';

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

router.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    try {
      const data = await bulkSessionActions(
        req.tenantContext.tenantId,
        req.body || {},
        actorFromCtx(req.tenantContext),
        req.tenantContext
      );
      res.json({ data });
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
  '/live',
  asyncHandler(async (req, res) => {
    try {
      const items = await listLiveSessionsEnriched(req.tenantContext.tenantId, {
        limit: req.query.limit,
        exam_id: req.query.exam_id,
      });
      res.json({ data: items, next_cursor: null });
    } catch {
      const { items, next_cursor } = await listLiveSessions(req.tenantContext.tenantId, {
        cursor: req.query.next_cursor,
        limit: req.query.limit,
      });
      res.json({ data: items, next_cursor });
    }
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { items, next_cursor, total } = await listSessionsEnriched(req.tenantContext.tenantId, {
        cursor: req.query.next_cursor,
        limit: req.query.limit,
        exam_id: req.query.exam_id,
        status: req.query.status,
        review_status: req.query.review_status,
        review_decision: req.query.review_decision,
        q: req.query.q,
        has_violations: req.query.has_violations,
        from: req.query.from,
        to: req.query.to,
        sort: req.query.sort,
        highest_severity: req.query.highest_severity,
        min_risk: req.query.min_risk,
        live_only: req.query.live_only,
      });
      res.json({ data: items, next_cursor, total });
    } catch {
      const { items, next_cursor } = await listSessions(req.tenantContext.tenantId, {
        cursor: req.query.next_cursor,
        limit: req.query.limit,
        exam_id: req.query.exam_id,
      });
      res.json({ data: items, next_cursor });
    }
  })
);

/** After collection routes so /live and /bulk are not treated as session ids. */
router.use('/:id', requireSessionAccess());

router.post(
  '/:id/lockdown-events',
  requireSebWhenStrict,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const result = await ingestLockdownEvents(req.tenantContext.tenantId, req.params.id, req.body || {});
    res.status(202).json(result);
  })
);

router.post(
  '/:id/media/presign',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await presignMediaChunk(req.tenantContext.tenantId, req.params.id, req.body || {});
    res.status(201).json(data);
  })
);

router.post(
  '/:id/media/chunk-complete',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await completeMediaChunk(req.tenantContext.tenantId, req.params.id, req.body || {});
    res.status(201).json({ data });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const timeline = await getSessionTimeline(req.tenantContext.tenantId, req.params.id);
      if (!timeline) return notFound(res);
      res.json({
        data: {
          session: timeline.session,
          events: timeline.events,
          recording_origin: timeline.recording_origin,
        },
      });
    } catch {
      const detail = await getSessionDetail(req.tenantContext.tenantId, req.params.id);
      if (!detail) return notFound(res);
      res.json({ data: detail });
    }
  })
);

router.get(
  '/:id/evidence',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const data = await getSessionEvidence(req.tenantContext.tenantId, req.params.id);
    if (!data) return notFound(res);
    res.json({ data });
  })
);

router.get(
  '/:id/integrity-report',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const data = await buildIntegrityReport(req.tenantContext.tenantId, req.params.id);
    if (!data) return notFound(res);
    res.json({ data });
  })
);

router.get(
  '/:id/integrity-report.pdf',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const { renderSessionIntegrityPdf } = await import('../../services/exports/sessionIntegrityPdf.js');
    const buf = await renderSessionIntegrityPdf(req.tenantContext.tenantId, req.params.id);
    if (!buf) return notFound(res);
    const name = `integrity-report-${req.params.id.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  })
);

router.get(
  '/:id/review',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    const ok = await assertSessionBelongs(req.tenantContext.tenantId, req.params.id);
    if (!ok) return notFound(res);
    const data = await listReviewHistory(req.tenantContext.tenantId, req.params.id);
    res.json({ data });
  })
);

router.post(
  '/:id/review/start',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const data = await startReview(req.tenantContext.tenantId, req.params.id, actorFromCtx(req.tenantContext));
      res.json({ data });
    } catch (e) {
      if (e.status === 404) return notFound(res);
      throw e;
    }
  })
);

router.post(
  '/:id/review/decision',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const data = await decideSession(
        req.tenantContext.tenantId,
        req.params.id,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
      res.json({ data });
    } catch (e) {
      if (e.status === 404) return notFound(res);
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
  '/:id/review/notes',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const data = await addReviewNote(
        req.tenantContext.tenantId,
        req.params.id,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
      res.status(201).json({ data });
    } catch (e) {
      if (e.status === 404) return notFound(res);
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
  '/:id/events/:eventId/review',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const data = await reviewEvent(
        req.tenantContext.tenantId,
        req.params.id,
        req.params.eventId,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
      res.json({ data });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: e.message })
        );
      }
      if (e.status === 400 || e.status === 422) {
        return res.status(e.status).type('application/problem+json').json(
          problemDetails({
            type: e.status === 422 ? ProblemTypes.validation : ProblemTypes.validation,
            title: 'Validation Error',
            status: e.status,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/:id/incidents',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) return badId(res);
    try {
      const data = await addManualIncident(
        req.tenantContext.tenantId,
        req.params.id,
        req.body || {},
        actorFromCtx(req.tenantContext)
      );
      res.status(201).json({ data });
    } catch (e) {
      if (e.status === 404) return notFound(res);
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
