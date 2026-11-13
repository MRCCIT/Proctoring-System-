/**
 * Priority lanes P0–P4 for overload routing.
 * P0: answer-save / session heartbeat (never drop)
 * P1: violation ingest / lockdown events
 * P2: exports / reports
 * P3: thumbnails / snapshots
 * P4: enrichment / analytics
 */

export const LANES = ['P0', 'P1', 'P2', 'P3', 'P4'];

export const LANE_POLICY = {
  P0: { dropUnderLoad: false, maxLagMs: 500, description: 'Answer save, heartbeats, session control' },
  P1: { dropUnderLoad: false, maxLagMs: 2_000, description: 'Violation + lockdown ingest' },
  P2: { dropUnderLoad: true, maxLagMs: 30_000, description: 'Exam exports, bulk downloads' },
  P3: { dropUnderLoad: true, maxLagMs: 10_000, description: 'Snapshot / thumbnail uploads' },
  P4: { dropUnderLoad: true, maxLagMs: 60_000, description: 'Aggregates, non-critical analytics' },
};

export function laneDecision(operation, { loadLevel = 'L0', tenantId = null } = {}) {
  const op = String(operation || '').toLowerCase();
  let lane = 'P3';
  if (op.includes('answer') || op.includes('heartbeat') || op.includes('stream/start') || op.includes('session/end')) {
    lane = 'P0';
  } else if (op.includes('violation') || op.includes('lockdown') || op.includes('event')) {
    lane = 'P1';
  } else if (op.includes('export')) {
    lane = 'P2';
  } else if (op.includes('snapshot') || op.includes('thumbnail') || op.includes('recording-chunk')) {
    lane = 'P3';
  } else if (op.includes('aggregate') || op.includes('analytics')) {
    lane = 'P4';
  }

  const policy = LANE_POLICY[lane];
  // P2/P3/P4 drop only under severe load (L4). L2/L3 still allow exports so
  // local/demo and moderate production load do not hard-fail report downloads.
  // Set EXPORTS_DEFER_FROM=L2 (or L3) to restore stricter shedding.
  const deferFrom = String(process.env.EXPORTS_DEFER_FROM || 'L4').toUpperCase();
  const order = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
  const levelN = order[String(loadLevel || 'L0').toUpperCase()] ?? 0;
  const deferN = order[deferFrom] ?? 4;
  const degrade = levelN >= deferN;
  const allow =
    lane === 'P0' ||
    lane === 'P1' ||
    (!degrade || !policy.dropUnderLoad);

  const decision = {
    lane,
    allow,
    deferred: !allow,
    policy,
    reason: allow ? 'ok' : `deferred at load ${loadLevel}`,
  };
  try {
    // lazy import to avoid circular deps at module load
    import('./laneStats.js')
      .then((m) => m.recordLaneDecision(lane, { allow, deferred: !allow, tenantId }))
      .catch(() => {});
  } catch {
    /* ignore */
  }
  return decision;
}
