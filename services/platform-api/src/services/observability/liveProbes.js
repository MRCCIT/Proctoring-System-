import os from 'os';
import { query } from '../../config/database.js';
import { getRedis, isRedisEnabled } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { getAiGatewayStats, probeAiHealth } from '../ai/aiClient.js';
import { getRecentCounters } from './aggregator.js';
import { getLaneStats } from '../queue/laneStats.js';
import { getWsStats } from '../../ws/wsStats.js';
import { getAiDegradationLevel } from '../infra/degradation.js';
import { getGlobalLoadLevel } from '../capacity/loadLevelStore.js';

async function probeDb() {
  const t0 = Date.now();
  try {
    await query('SELECT 1');
    let pool = null;
    try {
      const { getPoolStats } = await import('../../config/database.js');
      pool = typeof getPoolStats === 'function' ? getPoolStats() : null;
    } catch {
      /* optional */
    }
    return {
      name: 'postgres',
      status: 'healthy',
      latency_ms: Date.now() - t0,
      queue_depth: pool?.waiting ?? null,
      details: pool || {},
    };
  } catch (e) {
    return {
      name: 'postgres',
      status: 'unhealthy',
      latency_ms: Date.now() - t0,
      details: { error: e.message },
    };
  }
}

async function probeRedis() {
  const t0 = Date.now();
  if (!isRedisEnabled()) {
    return { name: 'redis', status: 'unavailable', latency_ms: null, details: { reason: 'redis_disabled' } };
  }
  try {
    const redis = await getRedis();
    if (!redis) {
      return { name: 'redis', status: 'unavailable', latency_ms: null, details: { reason: 'no_client' } };
    }
    await redis.ping();
    let info = {};
    try {
      const raw = await redis.info('memory');
      const used = /used_memory:(\d+)/.exec(raw);
      const max = /maxmemory:(\d+)/.exec(raw);
      info = {
        used_memory: used ? Number(used[1]) : null,
        maxmemory: max ? Number(max[1]) : null,
      };
    } catch {
      /* ignore */
    }
    return {
      name: 'redis',
      status: 'healthy',
      latency_ms: Date.now() - t0,
      details: info,
    };
  } catch (e) {
    return {
      name: 'redis',
      status: 'unhealthy',
      latency_ms: Date.now() - t0,
      details: { error: e.message },
    };
  }
}

async function probeAi() {
  const t0 = Date.now();
  const up = await probeAiHealth();
  const gateway = getAiGatewayStats();
  let metrics = null;
  if (up) {
    try {
      const res = await fetch(`${config.aiServiceUrl}/metrics`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) metrics = await res.json();
    } catch {
      /* ignore */
    }
  }
  return {
    name: 'ai_sidecar',
    status: up ? 'healthy' : 'unhealthy',
    latency_ms: Date.now() - t0,
    details: { gateway, metrics: metrics || null, url: config.aiServiceUrl },
  };
}

function probeApiProcess() {
  const mem = process.memoryUsage();
  const req = getRecentCounters('platform_api', 'request_count', 60_000);
  const lat = getRecentCounters('platform_api', 'request_duration', 60_000);
  return {
    name: 'platform_api',
    status: 'healthy',
    latency_ms: lat.avg ? Math.round(lat.avg) : null,
    queue_depth: null,
    details: {
      rpm: req.sum,
      rss_bytes: mem.rss,
      heap_used: mem.heapUsed,
      uptime_s: Math.round(process.uptime()),
      load_avg: os.loadavg(),
    },
  };
}

function probeWebsocket() {
  const ws = getWsStats();
  return {
    name: 'websocket',
    status: 'healthy',
    latency_ms: null,
    queue_depth: ws.active_connections,
    details: ws,
  };
}

function probeQueues() {
  const lanes = getLaneStats();
  const pending = Object.values(lanes.lanes || {}).reduce((n, l) => n + Number(l.deferred || 0) + Number(l.pending || 0), 0);
  return {
    name: 'queue',
    status: pending > 1000 ? 'degraded' : 'healthy',
    latency_ms: null,
    queue_depth: pending,
    details: lanes,
  };
}

async function probeAdmission() {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM exam_sessions WHERE status IN ('active','paused','scheduled')`
    );
    const live = rows[0]?.n ?? 0;
    return {
      name: 'admission',
      status: 'healthy',
      latency_ms: null,
      queue_depth: live,
      details: { live_or_scheduled: live },
    };
  } catch (e) {
    return { name: 'admission', status: 'unhealthy', details: { error: e.message } };
  }
}

async function probeMedia() {
  try {
    const { rows } = await query(
      `SELECT COALESCE(SUM(storage_bytes),0)::bigint AS storage,
              COALESCE(SUM(bytes_egress),0)::bigint AS egress
         FROM exam_sessions`
    );
    return {
      name: 'media',
      status: 'healthy',
      latency_ms: null,
      details: {
        storage_bytes: String(rows[0]?.storage ?? 0),
        egress_bytes: String(rows[0]?.egress ?? 0),
      },
    };
  } catch (e) {
    return { name: 'media', status: 'unhealthy', details: { error: e.message } };
  }
}

export async function collectLiveProbes() {
  const [postgres, redis, ai, admission, media] = await Promise.all([
    probeDb(),
    probeRedis(),
    probeAi(),
    probeAdmission(),
    probeMedia(),
  ]);
  const api = probeApiProcess();
  const websocket = probeWebsocket();
  const queue = probeQueues();
  const load_level = getGlobalLoadLevel();
  let ai_degradation_level = 0;
  try {
    ai_degradation_level = await getAiDegradationLevel();
  } catch {
    /* ignore */
  }
  return {
    live: [api, websocket, postgres, redis, media, ai, queue, admission],
    controls: { load_level, ai_degradation_level },
  };
}

export async function persistSnapshots(live) {
  for (const s of live || []) {
    try {
      await query(
        `INSERT INTO infrastructure_snapshots (service_name, status, latency_ms, queue_depth, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [s.name, s.status, s.latency_ms ?? null, s.queue_depth ?? null, JSON.stringify(s.details || {})]
      );
    } catch {
      /* ignore */
    }
  }
}
