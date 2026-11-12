import { recommendLoadLevel } from '../capacity/loadLevel.js';
import { getGlobalLoadLevel, setGlobalLoadLevel, isGlobalLoadManual } from '../capacity/loadLevelStore.js';
import { getAiDegradationLevel, setAiDegradationLevel } from '../infra/degradation.js';
import { getRecentCounters } from './aggregator.js';
import { getWsStats } from '../../ws/wsStats.js';
import { getLaneStats } from '../queue/laneStats.js';
import { getGlobalPolicies, writeControlAudit } from './policies.js';

const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4'];
let lastChangeAt = 0;
const COOLDOWN_MS = 120_000;

function featuresForLevel(level) {
  const idx = LEVEL_ORDER.indexOf(level);
  if (idx >= 4) return { aiDegradationLevel: 3 };
  if (idx >= 3) return { aiDegradationLevel: 2 };
  if (idx >= 2) return { aiDegradationLevel: 1 };
  return { aiDegradationLevel: 0 };
}

/**
 * Automatic load controller with hysteresis/cooldown.
 * Respects manual overrides from global policies.
 */
export async function runLoadController({ live = [], hardware = null } = {}) {
  const policies = await getGlobalPolicies();
  if (policies.policies.load_level_manual || isGlobalLoadManual()) return { skipped: 'manual_load' };

  const lat = getRecentCounters('platform_api', 'request_duration', 60_000);
  const err = getRecentCounters('platform_api', 'error_5xx', 60_000);
  const req = getRecentCounters('platform_api', 'request_count', 60_000);
  const ws = getWsStats();
  const maxWs = Number(policies.policies.max_websocket_connections || 10000);
  const lanes = getLaneStats();
  const queueLagProxy = Object.values(lanes.lanes || {}).reduce((n, l) => n + Number(l.deferred || 0), 0) * 1000;

  const uploadOk = 1; // until media failure metric is denser
  const metrics = {
    apiP95Ms: lat.avg || 0,
    queueLag: queueLagProxy,
    uploadSuccessRate: uploadOk,
    wsSaturation: maxWs ? ws.active_connections / maxWs : 0,
  };

  const recommended = recommendLoadLevel(metrics);
  const current = getGlobalLoadLevel();
  const now = Date.now();
  const curIdx = LEVEL_ORDER.indexOf(current);
  const recIdx = LEVEL_ORDER.indexOf(recommended);

  let next = current;
  if (recIdx > curIdx) {
    next = recommended; // escalate immediately
  } else if (recIdx < curIdx) {
    if (now - lastChangeAt >= COOLDOWN_MS) {
      next = LEVEL_ORDER[Math.max(0, curIdx - 1)]; // one step down
    }
  }

  if (next !== current) {
    setGlobalLoadLevel(next, { manual: false });
    lastChangeAt = now;
    await writeControlAudit({
      action: 'load_level.auto_transition',
      scope: 'global',
      resource: 'load_level',
      old_value: { level: current },
      new_value: { level: next, metrics, err_rate: req.count ? err.sum / req.count : 0, hardware },
      source: 'automatic',
      reason: 'load_controller',
    });
  }

  if (!policies.policies.ai_degradation_manual) {
    const targetAi = featuresForLevel(next).aiDegradationLevel;
    const curAi = await getAiDegradationLevel();
    if (targetAi !== curAi) {
      await setAiDegradationLevel(targetAi);
      await writeControlAudit({
        action: 'ai_degradation.auto_transition',
        scope: 'global',
        resource: 'ai_degradation_level',
        old_value: { level: curAi },
        new_value: { level: targetAi, load_level: next },
        source: 'automatic',
        reason: 'load_controller_bridge',
      });
    }
  }

  return { current: next, recommended, metrics, live_count: live.length };
}
