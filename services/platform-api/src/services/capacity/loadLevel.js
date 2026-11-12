/**
 * Load-level controller L0..L4. Pure functions — wire to metrics later.
 * Answer-save path must remain fully functional at every level.
 */

export const LOAD_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'];

export const LEVEL_POLICY = {
  L0: { thumbnailRefreshSec: 20, allowAdminLiveVideo: 'all', snapshotsOnly: false, coalesceStatusSec: 1 },
  L1: { thumbnailRefreshSec: 40, allowAdminLiveVideo: 'all', snapshotsOnly: false, coalesceStatusSec: 2 },
  L2: { thumbnailRefreshSec: 40, allowAdminLiveVideo: 'focused', snapshotsOnly: false, coalesceStatusSec: 3 },
  L3: { thumbnailRefreshSec: 60, allowAdminLiveVideo: 'none', snapshotsOnly: true, coalesceStatusSec: 5 },
  L4: { thumbnailRefreshSec: 0, allowAdminLiveVideo: 'none', snapshotsOnly: true, coalesceStatusSec: 5, eventsOnly: true },
};

/**
 * @param {{ apiP95Ms?: number, queueLag?: number, uploadSuccessRate?: number, wsSaturation?: number, manual?: string|null }} metrics
 */
export function recommendLoadLevel(metrics = {}) {
  if (metrics.manual && LOAD_LEVELS.includes(metrics.manual)) return metrics.manual;
  const p95 = Number(metrics.apiP95Ms || 0);
  const lag = Number(metrics.queueLag || 0);
  const uploadOk = metrics.uploadSuccessRate == null ? 1 : Number(metrics.uploadSuccessRate);
  const wsSat = Number(metrics.wsSaturation || 0);

  if (p95 > 2000 || lag > 50_000 || uploadOk < 0.5 || wsSat > 0.95) return 'L4';
  if (p95 > 1000 || lag > 20_000 || uploadOk < 0.7 || wsSat > 0.85) return 'L3';
  if (p95 > 500 || lag > 5_000 || uploadOk < 0.85 || wsSat > 0.7) return 'L2';
  if (p95 > 300 || lag > 1_000 || uploadOk < 0.92 || wsSat > 0.55) return 'L1';
  return 'L0';
}

export function policyForLevel(level) {
  return LEVEL_POLICY[LOAD_LEVELS.includes(level) ? level : 'L0'];
}

export function canServeLiveVideo(level, { focused = false } = {}) {
  const p = policyForLevel(level);
  if (p.allowAdminLiveVideo === 'all') return true;
  if (p.allowAdminLiveVideo === 'focused') return focused;
  return false;
}
