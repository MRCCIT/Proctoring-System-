import { httpRequestDuration } from '../../infra/metrics.js';
import { emitMetric } from './aggregator.js';

function classifyRoute(path = '') {
  if (path.startsWith('/v1/sdk')) return 'candidate';
  if (path.startsWith('/v1/superadmin')) return 'superadmin';
  if (path.includes('/media')) return 'media';
  return 'tenant_admin';
}

function lowCardRoute(path = '') {
  return String(path)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:n')
    .slice(0, 120);
}

/**
 * Lightweight HTTP metrics middleware. Failures never affect responses.
 */
export function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const durNs = Number(process.hrtime.bigint() - start);
      const seconds = durNs / 1e9;
      const ms = seconds * 1000;
      const route = lowCardRoute(req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.path);
      const status = String(res.statusCode);
      httpRequestDuration.observe({ method: req.method, route, status }, seconds);

      const tenantId =
        req.tenantContext?.tenantId ||
        req.tenant?.id ||
        (req.superadmin ? null : null);

      emitMetric({
        tenant_id: tenantId || null,
        service_name: 'platform_api',
        workload_type: classifyRoute(req.path),
        operation_name: `${req.method} ${route}`,
        metric_name: 'request_duration',
        metric_value: ms,
        metric_unit: 'milliseconds',
        status: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'client_error' : 'ok',
        attribution: tenantId ? 'attributed' : 'measured',
      });
      emitMetric({
        tenant_id: tenantId || null,
        service_name: 'platform_api',
        workload_type: classifyRoute(req.path),
        metric_name: 'request_count',
        metric_value: 1,
        metric_unit: 'count',
        attribution: tenantId ? 'attributed' : 'measured',
      });
      if (res.statusCode >= 500) {
        emitMetric({
          service_name: 'platform_api',
          metric_name: 'error_5xx',
          metric_value: 1,
          metric_unit: 'count',
        });
      } else if (res.statusCode === 429) {
        emitMetric({
          tenant_id: tenantId || null,
          service_name: 'platform_api',
          metric_name: 'rate_limited',
          metric_value: 1,
          metric_unit: 'count',
        });
      }
    } catch {
      /* ignore */
    }
  });
  next();
}
