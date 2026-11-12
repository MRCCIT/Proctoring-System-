/** Mirrors platform-api LEVEL_POLICY — snapshot/WebRTC degradation under load. */

export type LoadLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export const LEVEL_POLICY = {
  L0: { thumbnailRefreshSec: 20, allowAdminLiveVideo: 'all' as const, snapshotsOnly: false },
  L1: { thumbnailRefreshSec: 40, allowAdminLiveVideo: 'all' as const, snapshotsOnly: false },
  L2: { thumbnailRefreshSec: 40, allowAdminLiveVideo: 'focused' as const, snapshotsOnly: false },
  L3: { thumbnailRefreshSec: 60, allowAdminLiveVideo: 'none' as const, snapshotsOnly: true },
  L4: { thumbnailRefreshSec: 0, allowAdminLiveVideo: 'none' as const, snapshotsOnly: true, eventsOnly: true },
};

export function policyForLoadLevel(level: string | null | undefined) {
  const lv = (level && level in LEVEL_POLICY ? level : 'L0') as LoadLevel;
  return LEVEL_POLICY[lv];
}

export function snapshotIntervalMs(level: string | null | undefined): number {
  const p = policyForLoadLevel(level);
  const sec = p.thumbnailRefreshSec;
  if (!sec) return 0;
  return sec * 1000;
}
