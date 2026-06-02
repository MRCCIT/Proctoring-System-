import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import { analyzeFrame, detectPhone, compareFaces } from '../../services/ai/aiClient.js';
import { persistAnalyzerEvents, persistPhoneEvent } from '../../services/ai/monitoringPersistence.js';
import { runUnifiedProctorTick } from '../../services/ai/unifiedProctorAnalyze.js';

const router = Router({ mergeParams: true });

function parseBool(q) {
  const v = String(q || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

router.post(
  '/monitor-tick',
  asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!isUuid(sessionId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const image = req.body?.image || req.body?.frame;
    if (!image || typeof image !== 'string') {
      return res.status(422).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 422,
          detail: 'Body must include { image: "<data-url>" }',
        })
      );
    }
    try {
      const data = await runUnifiedProctorTick(req.sdkTenantId, sessionId, image, {
        persist: parseBool(req.query.persist),
        reference_image: req.body?.reference_image,
        identity_threshold: req.body?.identity_threshold,
        loadReference: req.body?.load_reference !== false,
      });
      res.json({ data });
    } catch (e) {
      const status = e.status || 503;
      return res.status(status).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.internal,
          title: status === 503 ? 'Service Unavailable' : 'Error',
          status,
          detail: e.message || 'AI proctor tick failed',
        })
      );
    }
  })
);

router.post(
  '/analyze-frame',
  asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!isUuid(sessionId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const image = (req.body && req.body.image) || req.body?.frame;
    if (!image || typeof image !== 'string') {
      return res.status(422).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 422,
          detail: 'Body must include { image: "<data-url or base64>" }',
        })
      );
    }
    try {
      const analysis = await analyzeFrame(image);
      let persistence = { persisted: 0 };
      if (parseBool(req.query.persist)) {
        persistence = await persistAnalyzerEvents(req.sdkTenantId, sessionId, analysis);
      }
      res.json({ data: { analysis, persistence } });
    } catch (e) {
      const status = e.status || 503;
      return res.status(status).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.internal,
          title: status === 503 ? 'Service Unavailable' : 'Error',
          status,
          detail: e.message || 'AI sidecar unreachable',
        })
      );
    }
  })
);

router.post(
  '/phone-check',
  asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!isUuid(sessionId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const image = req.body?.image;
    if (!image || typeof image !== 'string') {
      return res.status(422).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 422,
          detail: 'Body must include { image: "<data-url>" }',
        })
      );
    }
    try {
      const result = await detectPhone(image);
      let persistence = { persisted: 0 };
      if (parseBool(req.query.persist)) {
        persistence = await persistPhoneEvent(req.sdkTenantId, sessionId, result.phone_detected);
      }
      res.json({ data: { ...result, persistence } });
    } catch (e) {
      const status = e.status || 503;
      return res.status(status).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.internal,
          title: 'Service Unavailable',
          status,
          detail: e.message || 'AI sidecar unreachable',
        })
      );
    }
  })
);

router.post(
  '/face-compare',
  asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!isUuid(sessionId)) {
      return res.status(400).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid session id',
        })
      );
    }
    const body = req.body || {};
    try {
      const out = await compareFaces(body);
      res.json({ data: { session_id: sessionId, ...out } });
    } catch (e) {
      const status = e.status || 503;
      return res.status(status).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.internal,
          title: 'Error',
          status,
          detail: e.message || 'AI sidecar error',
        })
      );
    }
  })
);

export default router;
