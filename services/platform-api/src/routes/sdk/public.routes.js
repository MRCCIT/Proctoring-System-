import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { describeAccessLink, exchangeLaunchToken, startFromAccessLink } from '../../services/integration/accessLinks.js';

/**
 * Unauthenticated candidate entry points. Every call must present a signed token issued by the
 * tenant (launch token or access link); tenant context comes only from that token.
 */
const router = Router();

const buckets = new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.start > windowMs) {
      buckets.set(key, { start: now, count: 1 });
      if (buckets.size > 20_000) buckets.clear();
      return next();
    }
    b.count += 1;
    if (b.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((windowMs - (now - b.start)) / 1000)));
      const e = new Error('Too many requests. Please wait a moment and try again.');
      e.status = 429;
      return next(e);
    }
    return next();
  };
}

router.post(
  '/launch/exchange',
  rateLimit(30, 60_000),
  asyncHandler(async (req, res) => {
    const data = await exchangeLaunchToken(req.body?.launch_token);
    res.json({ data });
  })
);

router.get(
  '/links/describe',
  rateLimit(60, 60_000),
  asyncHandler(async (req, res) => {
    const data = await describeAccessLink(req.query.token);
    res.json({ data });
  })
);

router.post(
  '/links/start',
  rateLimit(10, 60_000),
  asyncHandler(async (req, res) => {
    const data = await startFromAccessLink(req.body?.link_token, req.body || {});
    res.status(201).json({ data });
  })
);

export default router;
