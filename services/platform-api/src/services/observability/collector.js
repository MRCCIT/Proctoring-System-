import { config } from '../../config/index.js';
import { collectLiveProbes, persistSnapshots } from './liveProbes.js';
import { collectHardwareSnapshot, persistHardwareSnapshot } from './hardwareCollector.js';
import { flushRollups } from './aggregator.js';
import { evaluateAlerts } from './alerts.js';
import { generateRecommendations } from './recommendations.js';
import { runLoadController } from './loadController.js';
import { syncRuntimeFromPolicies } from './policies.js';

let timer = null;
let running = false;

export function startObservabilityCollector() {
  if (!config.observabilityEnabled) {
    console.log('[observability] disabled');
    return;
  }
  if (timer) return;
  const interval = config.observabilityIntervalMs || 15_000;
  console.log(`[observability] collector every ${interval}ms`);
  syncRuntimeFromPolicies().catch(() => {});
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { live } = await collectLiveProbes();
      await persistSnapshots(live);
      const hw = await collectHardwareSnapshot();
      await persistHardwareSnapshot(hw);
      await flushRollups();
      await evaluateAlerts({ live, hardware: hw }).catch(() => {});
      await generateRecommendations().catch(() => {});
      await runLoadController({ live, hardware: hw }).catch(() => {});
    } catch (e) {
      console.warn('[observability] tick failed:', e.message);
    } finally {
      running = false;
    }
  };
  tick().catch(() => {});
  timer = setInterval(tick, interval);
  timer.unref?.();
}

export function stopObservabilityCollector() {
  if (timer) clearInterval(timer);
  timer = null;
}
