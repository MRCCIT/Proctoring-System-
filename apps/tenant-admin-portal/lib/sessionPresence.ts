import type { SessionRow } from './tenantApi';

/** Matches platform-api livePresenceSql (3-minute heartbeat window). */
export const LIVE_HEARTBEAT_MS = 3 * 60 * 1000;

/** True only when the candidate is actually present — not a zombie Active row. */
export function isSessionPresent(row: Pick<SessionRow, 'status' | 'connection_state' | 'last_heartbeat_at'> | null | undefined): boolean {
  if (!row) return false;
  if (!['active', 'paused'].includes(String(row.status || '').toLowerCase())) return false;
  if (row.connection_state !== 'connected') return false;
  if (!row.last_heartbeat_at) return false;
  const t = new Date(row.last_heartbeat_at).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= LIVE_HEARTBEAT_MS;
}

export function isSessionStatusLive(row: Pick<SessionRow, 'status'> | null | undefined): boolean {
  if (!row) return false;
  return ['active', 'paused'].includes(String(row.status || '').toLowerCase());
}
