import { API_BASE, tenantTokens } from './api';

export async function fetchSnapshotBlobUrl(snapshotId: string): Promise<string | null> {
  const token = tenantTokens.get();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/v1/media/snapshots/${snapshotId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Direct stream URL for <video src> — avoids downloading large WebM files into memory. */
export function recordingMediaUrl(chunkId: string | number): string | null {
  const token = tenantTokens.get();
  if (!token) return null;
  const qs = new URLSearchParams({ access_token: token });
  return `${API_BASE}/v1/media/recordings/${chunkId}?${qs}`;
}

export async function fetchRecordingBlobUrl(chunkId: string | number): Promise<string | null> {
  const token = tenantTokens.get();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/v1/media/recordings/${chunkId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function revokeBlobUrls(urls: string[]) {
  for (const u of urls) {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }
}

export function parseViolationLabel(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const m = caption.match(/Violation:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

export function snapshotKind(
  source: string | null | undefined,
  caption: string | null | undefined
): 'violation' | 'live' | 'other' {
  if (source === 'violation' || parseViolationLabel(caption) || /^violation:/i.test(caption || '')) {
    return 'violation';
  }
  if (source === 'live_preview' || /live\s*monitor/i.test(caption || '')) return 'live';
  return 'other';
}
