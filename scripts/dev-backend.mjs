/**
 * Single command: Python AI sidecar + Node platform API.
 *   npm run dev:backend
 *
 * - Frees API + AI ports from .env
 * - Starts AI first, preloads models, then starts API when AI is ready
 * - One Ctrl+C stops both
 */
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { freePort } from '../services/platform-api/scripts/free-port.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const API_PORT = String(process.env.PORT || '3001');
const AI_HOST = process.env.AI_HOST || '127.0.0.1';
const AI_PORT = String(process.env.AI_PORT || '5055');
const AI_URL = `http://${AI_HOST}:${AI_PORT}`;
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`[backend] ${msg}`);
}

function prefixLines(stream, tag) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) console.log(`[${tag}] ${line}`);
    }
  });
}

function spawnProc(label, command, args, opts = {}) {
  const { env: extraEnv, shell, ...spawnOpts } = opts;
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: shell ?? false,
    ...spawnOpts,
  });
  children.push(child);
  prefixLines(child.stdout, label);
  prefixLines(child.stderr, label);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(`${label} exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    shutdown(code ?? 1);
  });
  return child;
}

async function waitForUrl(url, { timeoutMs = 180_000, intervalMs = 400, predicate } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        if (predicate) {
          const body = await res.json();
          if (predicate(body)) return true;
        } else {
          return true;
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Stopping AI + API…');
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 800).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  log(`Freeing ports ${API_PORT} (API) and ${AI_PORT} (AI)…`);
  freePort(API_PORT);
  freePort(AI_PORT);

  log(`Starting Python AI on ${AI_URL}…`);
  spawnProc('ai', PYTHON, ['python/run_ai_server.py'], {
    env: {
      AI_HOST,
      AI_PORT,
      PYTHONPATH: path.join(repoRoot, 'python'),
      PYTHONUNBUFFERED: '1',
    },
  });

  log('Waiting for AI health…');
  const aiUp = await waitForUrl(`${AI_URL}/health`, { timeoutMs: 120_000 });
  if (!aiUp) {
    log('AI did not become healthy in time.');
    shutdown(1);
    return;
  }

  log('Waiting for AI model preload (analyzer + phone + gaze)…');
  const modelsReady = await waitForUrl(`${AI_URL}/health`, {
    timeoutMs: 300_000,
    intervalMs: 800,
    predicate: (b) => b.models_ready === true,
  });
  if (modelsReady) log('AI models ready.');
  else log('AI preload still running — API will start anyway (first exam tick may be slower).');

  log(`Starting Node API on port ${API_PORT}…`);
  spawnProc('api', 'npm', ['run', 'dev', '-w', '@proctorshield/platform-api'], { shell: true });

  const apiUp = await waitForUrl(`http://127.0.0.1:${API_PORT}/health`, {
    timeoutMs: 60_000,
    predicate: (b) => b.status === 'ok' || b.status === 'degraded',
  });
  if (!apiUp) {
    log('API health check timed out (process may still be starting).');
  } else {
    const h = await fetch(`http://127.0.0.1:${API_PORT}/health`).then((r) => r.json());
    log(`Ready — API http://localhost:${API_PORT} (ai: ${h.ai ?? 'unknown'})`);
    log('Candidate app: npm run dev:candidate · Tenant: npm run dev:tenant');
  }
}

main().catch((e) => {
  console.error(e);
  shutdown(1);
});
