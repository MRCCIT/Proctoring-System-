import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import superadminRoutes from './routes/superadmin.routes.js';
import { registerTenantHttpRoutes } from './routes/tenant/index.js';
import { registerMediaRoutes } from './routes/media.routes.js';
import sdkCandidateRoutes from './routes/sdk/index.js';
import { query } from './config/database.js';
import { probeAiHealth } from './services/ai/aiClient.js';
import { config } from './config/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(corsMiddleware);
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '20mb' }));

  app.get('/health', async (_req, res) => {
    const result = {
      status: 'ok',
      api: 'up',
      db: 'unknown',
      ai: 'unknown',
      ai_url: config.aiServiceUrl,
      time: new Date().toISOString(),
    };
    try {
      await query('SELECT 1');
      result.db = 'up';
    } catch (e) {
      result.db = 'down';
      result.status = 'degraded';
      const code = e?.code ?? e?.errors?.[0]?.code;
      const addr = e?.errors?.[0]?.address;
      const port = e?.errors?.[0]?.port;
      result.db_error =
        code && port != null
          ? `${code} (${addr || 'host'}:${port})`
          : (e && e.message) || String(e);
      if (process.env.NODE_ENV === 'development' && config.databaseUrl) {
        try {
          const u = new URL(config.databaseUrl.replace(/^postgresql:/, 'http:'));
          result.db_target = `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
        } catch {
          /* ignore */
        }
      }
    }
    result.ai = (await probeAiHealth()) ? 'up' : 'down';
    if (result.ai !== 'up') result.status = result.status === 'degraded' ? 'degraded' : 'degraded';
    res.json(result);
  });

  app.use('/v1/superadmin', superadminRoutes);
  registerMediaRoutes(app);
  app.use('/v1/sdk', sdkCandidateRoutes);
  registerTenantHttpRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
