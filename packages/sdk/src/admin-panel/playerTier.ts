/**
 * Admin playback tier: snapshot → live WebRTC (while watching) → recorded HLS/chunks.
 */

export type PlayerTier = 'snapshot' | 'live_webrtc' | 'recorded_hls' | 'chunk_fallback';

export interface PlayerTierInput {
  watchingLive?: boolean;
  snapshotUrl?: string | null;
  hlsUrl?: string | null;
  chunkUrl?: string | null;
  loadLevel?: string | null;
  focused?: boolean;
}

export function pickPlayerTier(input: PlayerTierInput): { tier: PlayerTier; url: string | null } {
  const lv = input.loadLevel || 'L0';
  const blockedLive = lv === 'L3' || lv === 'L4';

  if (input.watchingLive && !blockedLive && (lv !== 'L2' || input.focused)) {
    return { tier: 'live_webrtc', url: null };
  }
  if (input.snapshotUrl && (lv !== 'L4' || !input.hlsUrl)) {
    return { tier: 'snapshot', url: input.snapshotUrl };
  }
  if (input.hlsUrl) {
    return { tier: 'recorded_hls', url: input.hlsUrl };
  }
  if (input.chunkUrl) {
    return { tier: 'chunk_fallback', url: input.chunkUrl };
  }
  return { tier: 'snapshot', url: input.snapshotUrl || null };
}
