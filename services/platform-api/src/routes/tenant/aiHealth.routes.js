import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { config } from '../../config/index.js';
import { fetchAiHealth } from '../../services/ai/aiClient.js';

const router = Router();

/**
 * GET /v1/tenant/ai-health
 * Probes the Python AI sidecar. Never blocks exam delivery if AI is down.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const health = await fetchAiHealth();
    const status = health.reachable ? 200 : 503;
    res.status(status).json({
      data: {
        ok: Boolean(health.reachable),
        url: health.url || config.aiServiceUrl,
        latency_ms: health.latency_ms,
        http_status: health.http_status,
        error: health.error || null,
        body: health.body,
      },
    });
  })
);

export default router;
