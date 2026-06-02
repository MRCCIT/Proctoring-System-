import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireSdkApiKey } from '../../middleware/sdkApiKey.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import {
  initSdkSession,
  getSdkSessionConfig,
  recordSystemCheck,
  recordIdentity,
  startMediaStream,
  endSdkSession,
} from '../../services/sdk/candidateSessions.js';
import { ingestSdkEvents } from '../../services/sdk/sdkEvents.js';
import { buildTurnCredentials } from '../../services/sdk/turn.js';
import { getBranding } from '../../services/tenant/branding.js';
import {
  insertRecordingChunk,
  insertFaceChecks,
  insertSnapshotEvidence,
} from '../../services/tenant/recording.js';
import { postCandidateChatMessage, listSessionChatMessages } from '../../services/tenant/chat.js';
import { getSessionIdentityReference } from '../../services/sdk/identityReference.js';
import aiMonitoringRoutes from './aiMonitoring.routes.js';

const router = Router();

router.use(requireSdkApiKey);
router.use('/sessions/:sessionId/ai', aiMonitoringRoutes);

router.get(
  '/branding',
  asyncHandler(async (req, res) => {
    const data = await getBranding(req.sdkTenantId);
    res.json({ data });
  })
);

router.post(
  '/sessions/init',
  asyncHandler(async (req, res) => {
    try {
      const data = await initSdkSession(req.sdkTenantId, req.body || {});
      res.status(201).json({ data });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.get(
  '/sessions/:id/config',
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
    const cfg = await getSdkSessionConfig(req.sdkTenantId, req.params.id);
    if (!cfg) {
      return res.status(404).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.notFound,
          title: 'Not Found',
          status: 404,
          detail: 'Session not found',
        })
      );
    }
    res.json({ data: cfg });
  })
);

router.post(
  '/sessions/:id/system-check',
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
    try {
      const row = await recordSystemCheck(req.sdkTenantId, req.params.id, req.body || {});
      res.status(201).json({ data: row });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/sessions/:id/identity',
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
    try {
      const result = await recordIdentity(req.sdkTenantId, req.params.id, req.body || {});
      res.status(201).json({ data: result });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      if (e.status === 413) {
        return res.status(413).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.validation,
            title: 'Payload Too Large',
            status: 413,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/sessions/:id/stream/start',
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
    try {
      const row = await startMediaStream(req.sdkTenantId, req.params.id, req.body || {});
      res.json({ data: row });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/sessions/:id/end',
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
    try {
      const row = await endSdkSession(req.sdkTenantId, req.params.id, req.body || {});
      res.json({ data: row });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/events',
  asyncHandler(async (req, res) => {
    try {
      const data = await ingestSdkEvents(req.sdkTenantId, req.body || {});
      res.status(201).json({ data });
    } catch (e) {
      if (e.status === 404 || e.status === 422) {
        return res.status(e.status).type('application/problem+json').json(
          problemDetails({
            type: e.status === 422 ? ProblemTypes.validation : ProblemTypes.notFound,
            title: e.status === 422 ? 'Validation Error' : 'Not Found',
            status: e.status,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.get(
  '/turn-credentials',
  asyncHandler(async (_req, res) => {
    res.json({ data: buildTurnCredentials() });
  })
);

function ensureSessionUuid(req, res) {
  if (!isUuid(req.params.id)) {
    res.status(400).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.validation,
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid session id',
      })
    );
    return false;
  }
  return true;
}

router.post(
  '/sessions/:id/recording-chunk',
  asyncHandler(async (req, res) => {
    if (!ensureSessionUuid(req, res)) return;
    const row = await insertRecordingChunk(req.sdkTenantId, req.params.id, req.body || {});
    res.status(201).json({ data: row });
  })
);

router.post(
  '/sessions/:id/face-checks',
  asyncHandler(async (req, res) => {
    if (!ensureSessionUuid(req, res)) return;
    try {
      const data = await insertFaceChecks(req.sdkTenantId, req.params.id, req.body?.items || req.body || []);
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
  '/sessions/:id/identity-reference',
  asyncHandler(async (req, res) => {
    if (!ensureSessionUuid(req, res)) return;
    try {
      const data = await getSessionIdentityReference(req.sdkTenantId, req.params.id);
      res.json({ data });
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.notFound,
            title: 'Not Found',
            status: 404,
            detail: e.message,
          })
        );
      }
      throw e;
    }
  })
);

router.post(
  '/sessions/:id/snapshots',
  asyncHandler(async (req, res) => {
    if (!ensureSessionUuid(req, res)) return;
    const data = await insertSnapshotEvidence(req.sdkTenantId, req.params.id, req.body || {});
    res.status(201).json({ data });
  })
);

router.get(
  '/sessions/:id/chat',
  asyncHandler(async (req, res) => {
    if (!ensureSessionUuid(req, res)) return;
    const data = await listSessionChatMessages(req.sdkTenantId, req.params.id, { limit: req.query.limit });
    res.json({ data });
  })
);

router.post(
  '/sessions/:id/chat',
  asyncHandler(async (req, res) => {
    if (!ensureSessionUuid(req, res)) return;
    try {
      const data = await postCandidateChatMessage(req.sdkTenantId, req.params.id, req.body || {});
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

export default router;
