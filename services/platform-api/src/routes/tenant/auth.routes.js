import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  loginTenantAdmin,
  acceptInvite,
  forgotPassword,
  resetPassword,
  peekAuthToken,
} from '../../services/tenant/auth.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';

function sendAuthError(req, res, e) {
  const status = e.status || 500;
  if (status >= 500) throw e;
  const type =
    status === 422
      ? ProblemTypes.validation
      : status === 403
        ? ProblemTypes.forbidden
        : status === 409
          ? ProblemTypes.conflict
          : ProblemTypes.unauthorized;
  const title =
    status === 422
      ? 'Validation Error'
      : status === 403
        ? 'Forbidden'
        : status === 409
          ? 'Conflict'
          : 'Unauthorized';
  return res.status(status).type('application/problem+json').json(
    problemDetails({
      type,
      title,
      status,
      detail: e.message,
      instance: req.originalUrl,
    })
  );
}

export const tenantLoginHandler = asyncHandler(async (req, res) => {
  try {
    const result = await loginTenantAdmin(req.body || {});
    res.json(result);
  } catch (e) {
    return sendAuthError(req, res, e);
  }
});

export const tenantAuthRouter = Router();

tenantAuthRouter.post('/login', tenantLoginHandler);

tenantAuthRouter.get(
  '/invite/:token',
  asyncHandler(async (req, res) => {
    try {
      const data = await peekAuthToken(req.params.token, 'invite');
      res.json({ data });
    } catch (e) {
      return sendAuthError(req, res, e);
    }
  })
);

tenantAuthRouter.get(
  '/reset/:token',
  asyncHandler(async (req, res) => {
    try {
      const data = await peekAuthToken(req.params.token, 'reset');
      res.json({ data });
    } catch (e) {
      return sendAuthError(req, res, e);
    }
  })
);

tenantAuthRouter.post(
  '/accept-invite',
  asyncHandler(async (req, res) => {
    try {
      const result = await acceptInvite(req.body || {});
      res.json(result);
    } catch (e) {
      return sendAuthError(req, res, e);
    }
  })
);

tenantAuthRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    try {
      const result = await forgotPassword(req.body || {});
      res.json(result);
    } catch (e) {
      return sendAuthError(req, res, e);
    }
  })
);

tenantAuthRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    try {
      const result = await resetPassword(req.body || {});
      res.json(result);
    } catch (e) {
      return sendAuthError(req, res, e);
    }
  })
);
