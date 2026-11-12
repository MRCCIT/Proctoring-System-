import { createHash, timingSafeEqual } from 'crypto';
import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { query } from '../config/database.js';
import { getLatestLockdownPolicy } from '../services/lockdown/policyStore.js';

/**
 * Safe Exam Browser (SEB) header validation for STRICT lockdown.
 *
 * Expected request headers (case-insensitive):
 * - X-SafeExamBrowser-RequestHash — Browser Exam Key hash for this request URL
 * - X-SafeExamBrowser-ConfigKeyHash — config key hash configured in SEB
 *
 * Set SEB_CONFIG_KEY_HASH / SEB_BROWSER_EXAM_KEY_HASH to enforce. When unset, structure is checked only (stub-ok).
 * SEB is optional — normal browsers cannot be fully locked.
 */
export const SEB_HEADER_DOCS = {
  requestHash: 'X-SafeExamBrowser-RequestHash',
  configKeyHash: 'X-SafeExamBrowser-ConfigKeyHash',
};

function header(req, name) {
  const v = req.headers[name.toLowerCase()];
  return v ? String(v).trim() : '';
}

function hashHex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function resolveSessionLockdownMode(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT exam_id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  const examId = rows[0]?.exam_id;
  if (!examId) return 'STANDARD';
  const row = await getLatestLockdownPolicy(tenantId, examId);
  return row?.policy?.mode || 'STANDARD';
}

/**
 * Express middleware — call after tenant/session context is known.
 * req.params.id or req.params.sessionId holds the session UUID.
 */
export async function requireSebWhenStrict(req, res, next) {
  const sessionId = req.params.id || req.params.sessionId;
  const tenantId = req.tenantContext?.tenantId || req.sdkTenantId;
  if (!tenantId || !sessionId) return next();

  let mode = 'STANDARD';
  try {
    mode = await resolveSessionLockdownMode(tenantId, sessionId);
  } catch {
    return next();
  }
  if (mode !== 'STRICT') return next();

  const requestHash = header(req, SEB_HEADER_DOCS.requestHash);
  const configKeyHash = header(req, SEB_HEADER_DOCS.configKeyHash);

  if (!requestHash || !configKeyHash) {
    return res.status(403).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.forbidden,
        title: 'SEB Required',
        status: 403,
        detail: `STRICT lockdown requires ${SEB_HEADER_DOCS.requestHash} and ${SEB_HEADER_DOCS.configKeyHash} headers.`,
      })
    );
  }

  const expectedConfig = process.env.SEB_CONFIG_KEY_HASH || '';
  const expectedRequest = process.env.SEB_BROWSER_EXAM_KEY_HASH || '';

  if (expectedConfig && !safeEqual(hashHex(expectedConfig), configKeyHash) && !safeEqual(expectedConfig, configKeyHash)) {
    return res.status(403).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.forbidden,
        title: 'Invalid SEB config key',
        status: 403,
        detail: 'Config key hash does not match server configuration.',
      })
    );
  }
  if (expectedRequest && !safeEqual(hashHex(expectedRequest), requestHash) && !safeEqual(expectedRequest, requestHash)) {
    return res.status(403).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.forbidden,
        title: 'Invalid Browser Exam Key',
        status: 403,
        detail: 'Browser Exam Key hash does not match server configuration.',
      })
    );
  }

  return next();
}
