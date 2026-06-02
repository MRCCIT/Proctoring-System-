import { asyncHandler } from '../../utils/asyncHandler.js';
import { loginTenantAdmin } from '../../services/tenant/auth.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';

export const tenantLoginHandler = asyncHandler(async (req, res) => {
  try {
    const result = await loginTenantAdmin(req.body || {});
    res.json(result);
  } catch (e) {
    if (e.status === 401 || e.status === 422) {
      return res.status(e.status).type('application/problem+json').json(
        problemDetails({
          type: e.status === 422 ? ProblemTypes.validation : ProblemTypes.unauthorized,
          title: e.status === 422 ? 'Validation Error' : 'Unauthorized',
          status: e.status,
          detail: e.message,
          instance: req.originalUrl,
        })
      );
    }
    throw e;
  }
});
