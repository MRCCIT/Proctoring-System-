import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';

/** pg / AggregateError connection failures → map to HTTP 503 */
export function isDatabaseUnreachable(err) {
  const code = err?.code ?? err?.errors?.[0]?.code;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return true;
  }
  if (err?.name === 'AggregateError' && Array.isArray(err.errors)) {
    return err.errors.some(
      (e) =>
        e?.code === 'ECONNREFUSED' || e?.code === 'ETIMEDOUT' || e?.code === 'ENOTFOUND'
    );
  }
  return false;
}

export function notFoundHandler(req, res) {
  res.status(404).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.notFound,
      title: 'Not Found',
      status: 404,
      detail: `No route matches ${req.method} ${req.originalUrl}`,
      instance: req.originalUrl,
    })
  );
}

export function errorHandler(err, req, res, _next) {
  if (isDatabaseUnreachable(err)) {
    err.status = 503;
    err.title = 'Service Unavailable';
    err.type = ProblemTypes.serviceUnavailable;
    err.message =
      'Cannot reach PostgreSQL. Start the database (e.g. docker compose up -d postgres from the repo root) and check DATABASE_URL.';
  }

  const status = err.status || err.statusCode || 500;
  let type = err.type;
  if (!type) {
    if (status === 422) type = ProblemTypes.validation;
    else if (status === 409) type = ProblemTypes.conflict;
    else if (status === 401) type = ProblemTypes.unauthorized;
    else if (status === 403) type = ProblemTypes.forbidden;
    else if (status === 404) type = ProblemTypes.notFound;
    else if (status === 503) type = ProblemTypes.serviceUnavailable;
    else if (status === 500) type = ProblemTypes.internal;
    else type = 'about:blank';
  }
  const body = problemDetails({
    type,
    title:
      err.title ||
      (status === 503 ? 'Service Unavailable' : status === 500 ? 'Internal Server Error' : 'Error'),
    status,
    detail: err.message || undefined,
    instance: req.originalUrl,
    extensions: err.extensions || {},
  });
  if (status >= 500 && status !== 503 && process.env.NODE_ENV !== 'development') {
    body.detail = 'An unexpected error occurred.';
  }
  if (status === 503 && process.env.NODE_ENV !== 'development') {
    body.detail =
      body.detail ||
      'The service cannot reach its database right now. Please try again shortly.';
  }
  res.status(status).type('application/problem+json').json(body);

  console.error('[api]', req.method, req.originalUrl, status, err?.message || err);
}
