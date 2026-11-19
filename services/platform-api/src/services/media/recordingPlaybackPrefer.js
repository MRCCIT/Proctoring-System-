/**
 * Pure preference order for admin playback sources.
 * compressed (completed) → fallback H.264 → original.
 */
export function preferRecordingSource(sources = {}) {
  const { original = null, compressed = null, fallback = null } = sources;

  // Treat null status as playable (legacy pre-dual-storage merges).
  const compressedReady =
    compressed?.url &&
    (!compressed.compression_status ||
      compressed.compression_status === 'completed');
  if (compressedReady) {
    return { key: 'compressed', source: compressed };
  }

  if (fallback?.url) return { key: 'fallback', source: fallback };
  if (original?.url) return { key: 'original', source: original };

  // Incomplete compressed still playable as last resort before nothing
  if (compressed?.url) return { key: 'compressed', source: compressed };
  return null;
}

export function savingsPercent(originalBytes, compressedBytes) {
  const o = Number(originalBytes);
  const c = Number(compressedBytes);
  if (!Number.isFinite(o) || !Number.isFinite(c) || o <= 0) return null;
  return Number((((o - c) / o) * 100).toFixed(1));
}

/** Job skip when compressed already completed for same original checksum. */
export function shouldSkipCompressJob({ force, existingStatus, existingOriginalChecksum, currentOriginalChecksum }) {
  if (force) return false;
  if (existingStatus !== 'completed') return false;
  if (!currentOriginalChecksum) return true;
  if (!existingOriginalChecksum) return true;
  return existingOriginalChecksum === currentOriginalChecksum;
}
