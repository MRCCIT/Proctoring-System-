import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { verifySuperAdminToken } from '../utils/jwt.js';

export function requireSuperAdminJwt(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).type('application/problem+json').json(
      problemDetails({
        type: ProblemTypes.unauthorized,
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid Authorization header. Expected: Bearer <JWT>.',
      })
    );
  }
  try {
    const decoded = verifySuperAdminToken(token);
    if (decoded.role !== 'superadmin') {
      throw Object.assign(new Error('Invalid token scope'), { status: 403 });
    }
    req.superadmin = { sub: decoded.sub, email: decoded.email };
    next();
  } catch (e) {
    const status = e.status || 401;
    return res.status(status).type('application/problem+json').json(
      problemDetails({
        type: status === 403 ? ProblemTypes.forbidden : ProblemTypes.unauthorized,
        title: status === 403 ? 'Forbidden' : 'Unauthorized',
        status,
        detail: e.message || 'Invalid or expired token.',
      })
    );
  }
}
