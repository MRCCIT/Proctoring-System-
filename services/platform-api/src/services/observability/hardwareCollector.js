import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { query } from '../../config/database.js';

const execFileAsync = promisify(execFile);

function nodeId() {
  return process.env.INFRA_NODE_ID || os.hostname() || 'local';
}

async function readDisk() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-Command', "(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | Select-Object -First 1 | ForEach-Object { $_.Used; $_.Free }) -join ','"],
        { timeout: 4000 }
      );
      const [used, free] = String(stdout)
        .trim()
        .split(',')
        .map((x) => Number(x));
      if (Number.isFinite(used) && Number.isFinite(free)) {
        const total = used + free;
        return {
          disk_used_bytes: used,
          disk_total_bytes: total,
          disk_pct: total ? Math.round((used / total) * 10000) / 100 : null,
        };
      }
    } else {
      const { stdout } = await execFileAsync('df', ['-k', '/'], { timeout: 3000 });
      const line = String(stdout).trim().split('\n')[1];
      const parts = line?.split(/\s+/) || [];
      const totalK = Number(parts[1]);
      const usedK = Number(parts[2]);
      if (Number.isFinite(totalK) && Number.isFinite(usedK)) {
        return {
          disk_used_bytes: usedK * 1024,
          disk_total_bytes: totalK * 1024,
          disk_pct: totalK ? Math.round((usedK / totalK) * 10000) / 100 : null,
        };
      }
    }
  } catch {
    /* unavailable */
  }
  return { disk_used_bytes: null, disk_total_bytes: null, disk_pct: null };
}

async function readGpu() {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw', '--format=csv,noheader,nounits'],
      { timeout: 4000 }
    );
    const gpus = String(stdout)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, util, memUsed, memTotal, temp, power] = line.split(',').map((s) => s.trim());
        return {
          name,
          utilization_pct: Number(util),
          memory_used_mb: Number(memUsed),
          memory_total_mb: Number(memTotal),
          temperature_c: Number(temp),
          power_w: Number(power),
        };
      });
    return gpus.length ? gpus : null;
  } catch {
    return null;
  }
}

let lastCpu = os.cpus().map((c) => ({ ...c.times }));

function cpuPct() {
  const cpus = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;
  cpus.forEach((cpu, i) => {
    const prev = lastCpu[i] || cpu.times;
    const idle = cpu.times.idle - prev.idle;
    const total =
      Object.values(cpu.times).reduce((a, b) => a + b, 0) -
      Object.values(prev).reduce((a, b) => a + b, 0);
    idleDiff += idle;
    totalDiff += total;
  });
  lastCpu = cpus.map((c) => ({ ...c.times }));
  if (totalDiff <= 0) return null;
  return Math.round((1 - idleDiff / totalDiff) * 1000) / 10;
}

export async function collectHardwareSnapshot() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const disk = await readDisk();
  const gpu = await readGpu();
  const snapshot = {
    id: nodeId(),
    hostname: os.hostname(),
    role: process.env.INFRA_NODE_ROLE || 'api',
    status: 'healthy',
    cpu_pct: cpuPct(),
    ram_pct: totalMem ? Math.round((usedMem / totalMem) * 10000) / 100 : null,
    ram_used_bytes: usedMem,
    ram_total_bytes: totalMem,
    disk_pct: disk.disk_pct,
    disk_used_bytes: disk.disk_used_bytes,
    disk_total_bytes: disk.disk_total_bytes,
    network_rx_bps: null,
    network_tx_bps: null,
    gpu: gpu,
    details: {
      platform: process.platform,
      arch: os.arch(),
      load_avg: os.loadavg(),
      cpu_count: os.cpus().length,
      node_version: process.version,
      process_rss: process.memoryUsage().rss,
      unavailable: {
        network: true,
        gpu: !gpu,
        disk: disk.disk_pct == null,
      },
    },
  };
  return snapshot;
}

export async function persistHardwareSnapshot(snap) {
  if (!snap) return;
  try {
    await query(
      `INSERT INTO infra_nodes (
         id, hostname, role, status, cpu_pct, ram_pct, ram_used_bytes, ram_total_bytes,
         disk_pct, disk_used_bytes, disk_total_bytes, network_rx_bps, network_tx_bps, gpu, details, last_seen_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         hostname = EXCLUDED.hostname,
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         cpu_pct = EXCLUDED.cpu_pct,
         ram_pct = EXCLUDED.ram_pct,
         ram_used_bytes = EXCLUDED.ram_used_bytes,
         ram_total_bytes = EXCLUDED.ram_total_bytes,
         disk_pct = EXCLUDED.disk_pct,
         disk_used_bytes = EXCLUDED.disk_used_bytes,
         disk_total_bytes = EXCLUDED.disk_total_bytes,
         network_rx_bps = EXCLUDED.network_rx_bps,
         network_tx_bps = EXCLUDED.network_tx_bps,
         gpu = EXCLUDED.gpu,
         details = EXCLUDED.details,
         last_seen_at = now()`,
      [
        snap.id,
        snap.hostname,
        snap.role,
        snap.status,
        snap.cpu_pct,
        snap.ram_pct,
        snap.ram_used_bytes,
        snap.ram_total_bytes,
        snap.disk_pct,
        snap.disk_used_bytes,
        snap.disk_total_bytes,
        snap.network_rx_bps,
        snap.network_tx_bps,
        JSON.stringify(snap.gpu),
        JSON.stringify(snap.details || {}),
      ]
    );
  } catch {
    /* migration may not be applied yet */
  }
}

export async function listInfraNodes() {
  try {
    const { rows } = await query(`SELECT * FROM infra_nodes ORDER BY last_seen_at DESC`);
    return rows;
  } catch {
    return [];
  }
}

/** Avoid unused import lint in some bundlers */
void fs;
