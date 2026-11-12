import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireIntegrationApiKey } from '../middleware/sdkApiKey.js';
import { isUuid } from '../utils/validation.js';
import {
  createIntegrationSession,
  getIntegrationSession,
  listIntegrationSessions,
  serializeIntegrationSession,
  buildLaunch,
} from '../services/integration/sessions.js';
import { closeSession } from '../services/sdk/candidateSessions.js';
import { buildIntegrityReport, getSessionEvidence, getSessionTimeline } from '../services/tenant/review.js';

/**
 * Server-to-server Integration API for assessment platforms. Authenticated with the tenant API key;
 * the tenant is always derived from the key, never from the request body.
 */
const router = Router();
router.use(requireIntegrationApiKey);

function requireSessionId(id) {
  if (!isUuid(id)) {
    const e = new Error('Invalid session id');
    e.status = 400;
    throw e;
  }
}

function notFound() {
  const e = new Error('Session not found');
  e.status = 404;
  return e;
}

router.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const { session, created, reason } = await createIntegrationSession(req.sdkTenantId, req.body || {}, {
      idempotencyKey: req.headers['idempotency-key'],
    });
    if (['completed', 'failed', 'terminated'].includes(session.status)) {
      return res.status(200).json({ data: { ...serializeIntegrationSession(session), launch: null }, created, reason });
    }
    res
      .status(created ? 201 : 200)
      .json({ data: { ...serializeIntegrationSession(session), ...buildLaunch(req.sdkTenantId, session.id) }, created, reason });
  })
);

router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const rows = await listIntegrationSessions(req.sdkTenantId, req.query);
    res.json({ data: rows.map(serializeIntegrationSession) });
  })
);

router.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    requireSessionId(req.params.id);
    const s = await getIntegrationSession(req.sdkTenantId, req.params.id);
    if (!s) throw notFound();
    res.json({ data: serializeIntegrationSession(s) });
  })
);

/** Issue a fresh launch link (e.g. candidate refreshed or the previous link expired). */
router.post(
  '/sessions/:id/launch',
  asyncHandler(async (req, res) => {
    requireSessionId(req.params.id);
    const s = await getIntegrationSession(req.sdkTenantId, req.params.id);
    if (!s) throw notFound();
    if (['completed', 'failed', 'terminated'].includes(s.status)) {
      const e = new Error(`Session is already ${s.status}`);
      e.status = 409;
      throw e;
    }
    res.json({ data: buildLaunch(req.sdkTenantId, s.id) });
  })
);

/** Idempotent: ending an already-closed session returns its existing final state. */
router.post(
  '/sessions/:id/end',
  asyncHandler(async (req, res) => {
    requireSessionId(req.params.id);
    const status = req.body?.status === 'failed' ? 'failed' : 'completed';
    const out = await closeSession(req.sdkTenantId, req.params.id, {
      status,
      reason: req.body?.reason ? String(req.body.reason).slice(0, 300) : 'ended_by_assessment_platform',
    });
    if (!out.session) throw notFound();
    const s = await getIntegrationSession(req.sdkTenantId, req.params.id);
    res.json({ data: serializeIntegrationSession(s), already_closed: out.alreadyClosed });
  })
);

router.get(
  '/sessions/:id/violations',
  asyncHandler(async (req, res) => {
    requireSessionId(req.params.id);
    const t = await getSessionTimeline(req.sdkTenantId, req.params.id);
    if (!t) throw notFound();
    res.json({
      data: t.events
        .filter((e) => e.is_violation)
        .map((e) => ({
          id: e.id,
          code: e.code,
          label: e.label,
          category: e.category,
          severity: e.severity,
          source: e.source,
          occurred_at: e.occurred_at,
          offset_seconds: e.offset_seconds,
          review_status: e.review_status,
        })),
    });
  })
);

router.get(
  '/sessions/:id/evidence',
  asyncHandler(async (req, res) => {
    requireSessionId(req.params.id);
    const data = await getSessionEvidence(req.sdkTenantId, req.params.id);
    if (!data) throw notFound();
    res.json({ data });
  })
);

router.get(
  '/sessions/:id/report',
  asyncHandler(async (req, res) => {
    requireSessionId(req.params.id);
    const data = await buildIntegrityReport(req.sdkTenantId, req.params.id);
    if (!data) throw notFound();
    res.json({ data });
  })
);

export default router;
