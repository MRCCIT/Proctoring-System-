/**
 * Risk score = weighted sum of violations with time decay + dedup.
 * Maps legacy severities: info→LOW, warn→MEDIUM, flag→HIGH, critical→CRITICAL.
 */

export const SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

export const DEFAULT_WEIGHTS = {
  LOW: 1,
  MEDIUM: 3,
  HIGH: 8,
  CRITICAL: 20,
  info: 1,
  warn: 3,
  flag: 8,
  critical: 20,
};

const RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, info: 1, warn: 2, flag: 3, critical: 4 };

export function normalizeSeverity(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'critical' || s === 'CRITICAL'.toLowerCase()) return SEVERITY.CRITICAL;
  if (s === 'flag' || s === 'high') return SEVERITY.HIGH;
  if (s === 'warn' || s === 'medium') return SEVERITY.MEDIUM;
  if (s === 'info' || s === 'low') return SEVERITY.LOW;
  const u = String(raw || '').toUpperCase();
  if (u in SEVERITY) return u;
  return SEVERITY.LOW;
}

export function severityRank(s) {
  return RANK[normalizeSeverity(s)] || 0;
}

export function canonicalEventKey(eventType) {
  return String(eventType || '')
    .toLowerCase()
    .replace(/^violation\./, '')
    .replace(/^ai\./, '')
    .replace(/^ai_/, '');
}

/**
 * @param {Array<{ event_type?: string, severity?: string, occurred_at?: string|Date, review_status?: string }>} events
 * @param {{ weights?: Record<string, number>, dedupSeconds?: number, halfLifeSeconds?: number, maxScore?: number, now?: Date }} [policy]
 */
export function computeRiskScore(events, policy = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(policy.weights || {}) };
  const dedupSeconds = policy.dedupSeconds ?? 10;
  const halfLifeSeconds = policy.halfLifeSeconds ?? 30 * 60;
  const maxScore = policy.maxScore ?? 100;

  const usable = (events || []).filter((e) => e && e.review_status !== 'dismissed');
  if (!usable.length) return { score: 0, highest_severity: null, counted: 0 };

  const sorted = [...usable].sort(
    (a, b) => new Date(a.occurred_at || 0).getTime() - new Date(b.occurred_at || 0).getTime()
  );

  const latest = policy.now
    ? new Date(policy.now).getTime()
    : Math.max(...sorted.map((e) => new Date(e.occurred_at || 0).getTime()));

  const kept = [];
  for (const ev of sorted) {
    const key = canonicalEventKey(ev.event_type);
    const t = new Date(ev.occurred_at || 0).getTime();
    const prev = kept[kept.length - 1];
    if (
      prev &&
      canonicalEventKey(prev.event_type) === key &&
      Math.abs(t - new Date(prev.occurred_at || 0).getTime()) <= dedupSeconds * 1000
    ) {
      prev._count = (prev._count || 1) + 1;
      if (severityRank(ev.severity) > severityRank(prev.severity)) prev.severity = ev.severity;
      continue;
    }
    kept.push({ ...ev, _count: 1 });
  }

  let score = 0;
  let highest = null;
  for (const ev of kept) {
    const sev = normalizeSeverity(ev.severity);
    if (!highest || severityRank(sev) > severityRank(highest)) highest = sev;
    const w = weights[sev] ?? weights[String(ev.severity || '').toLowerCase()] ?? 1;
    const ageSec = Math.max(0, (latest - new Date(ev.occurred_at || 0).getTime()) / 1000);
    const decay = Math.pow(0.5, ageSec / halfLifeSeconds);
    score += w * (ev._count || 1) * decay;
  }

  return {
    score: Math.min(maxScore, Math.round(score * 100) / 100),
    highest_severity: highest,
    counted: kept.length,
  };
}
