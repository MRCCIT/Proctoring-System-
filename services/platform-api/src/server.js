import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { attachSdkWebSocket } from './ws/sdkSessionWs.js';
import { freePort } from '../scripts/free-port.mjs';

if (config.nodeEnv === 'development') {
  freePort(config.port);
}

const app = createApp();
const server = http.createServer(app);

attachSdkWebSocket(server);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use.\n` +
        `Stop the other server (often an old npm run dev:api), or run with a different port:\n` +
        `  set PORT=3001 && npm run dev -w @proctorshield/platform-api\n` +
        `On Windows PowerShell: $env:PORT=3001; npm run dev -w @proctorshield/platform-api`
    );
    process.exit(1);
    return;
  }
  console.error(err);
  process.exit(1);
});

server.listen(config.port, () => {
  console.log(`ProctorShield API listening on port ${config.port}`);
  console.log(`Super Admin: http://localhost:${config.port}/v1/superadmin`);
  console.log(`Tenant Admin: http://localhost:${config.port}/v1/...`);
  console.log(`Candidate SDK:  http://localhost:${config.port}/v1/sdk/...`);
  console.log(`WebSocket SDK:  ws://localhost:${config.port}/v1/sdk/ws/sessions/{sessionId}`);
  import('./services/exports/examExports.js')
    .then((m) => m.resumeQueuedExports?.())
    .catch(() => {});
  import('./services/observability/collector.js')
    .then((m) => m.startObservabilityCollector?.())
    .catch((e) => console.warn('[observability] start failed', e.message));
});

function shutdown(signal) {
  console.log(`${signal}: closing API…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
