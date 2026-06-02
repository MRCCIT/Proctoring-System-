/**
 * Frees a TCP listen port before `npm run dev` (avoids EADDRINUSE from stale API processes).
 * Usage: node scripts/free-port.mjs [port]
 */
import { execSync } from 'child_process';

export function freePort(portInput) {
  const port = String(portInput || process.env.PORT || '3000');
  if (process.platform === 'win32') freeWindows(port);
  else freeUnix(port);
}

function freeWindows(port) {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`[free-port] Stopped PID ${pid} on port ${port}`);
    } catch {
      /* ignore */
    }
  }
}

function freeUnix(port) {
  try {
    const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    if (!pids) return;
    for (const pid of pids.split(/\s+/)) {
      if (!pid) continue;
      try {
        process.kill(Number(pid), 'SIGTERM');
        console.log(`[free-port] Stopped PID ${pid} on port ${port}`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* port free */
  }
}

import path from 'path';
import { fileURLToPath } from 'url';

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) freePort(process.argv[2]);
