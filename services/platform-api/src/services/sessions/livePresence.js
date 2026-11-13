/**
 * Portal "Live" presence — display/count only.
 * Never terminates or closes exam_sessions; assessment ownership stays untouched.
 *
 * A session counts as live when it is open AND the candidate WS is connected
 * with a recent heartbeat (reconnect restores presence automatically).
 */

export const LIVE_HEARTBEAT_INTERVAL = `interval '3 minutes'`;

/**
 * SQL boolean for true Live presence.
 * @param {string} [alias='s'] exam_sessions alias; pass '' when columns are unqualified
 */
export function livePresenceSql(alias = 's') {
  const p = alias ? `${alias}.` : '';
  return `(
    ${p}status IN ('active','paused')
    AND ${p}connection_state = 'connected'
    AND ${p}last_heartbeat_at IS NOT NULL
    AND ${p}last_heartbeat_at > now() - ${LIVE_HEARTBEAT_INTERVAL}
  )`;
}
