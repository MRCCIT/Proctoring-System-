/**
 * Dev orchestration with production infra: Redis, MinIO, workers + AI + API.
 *   npm run infra:up
 *   npm run dev:prod-stack
 */
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`[prod-stack] ${msg}`);
}

function spawnProc(label, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: opts.shell ?? false,
  });
  children.push(child);
  child.stdout.on('data', (d) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (line.trim()) console.log(`[${label}] ${line}`);
    }
  });
  child.stderr.on('data', (d) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (line.trim()) console.log(`[${label}] ${line}`);
    }
  });
  child.on('exit', (code) => {
    if (!shuttingDown) {
      log(`${label} exited (${code})`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

log('Starting AI worker, telemetry worker, Python AI, and API…');
log('Ensure Redis is up: npm run infra:up');

spawnProc('ai-worker', 'npm', ['run', 'worker:ai', '-w', '@proctorshield/platform-api'], { shell: true });
spawnProc('telemetry', 'npm', ['run', 'worker:telemetry', '-w', '@proctorshield/platform-api'], { shell: true });

spawnProc('ai', PYTHON, ['python/run_ai_server.py'], {
  env: {
    AI_HOST: process.env.AI_HOST || '127.0.0.1',
    AI_PORT: process.env.AI_PORT || '5055',
    PYTHONPATH: path.join(repoRoot, 'python'),
    PYTHONUNBUFFERED: '1',
  },
});

setTimeout(() => {
  spawnProc('api', 'npm', ['run', 'dev', '-w', '@proctorshield/platform-api'], { shell: true });
  log('Stack running. Set AI_MODE=async TELEMETRY_MODE=async STORAGE_BACKEND=s3 in .env for full production paths.');
}, 3000);
