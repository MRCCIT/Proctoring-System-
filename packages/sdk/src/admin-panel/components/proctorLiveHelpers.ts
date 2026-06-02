export type ViolationSeverity = 'critical' | 'warning' | 'info';

export function candidateInitials(name?: string, email?: string): string {
  const n = (name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || '').trim();
  return e ? e.slice(0, 2).toUpperCase() : '?';
}

export function parseViolationCaption(caption: string): {
  label: string;
  code: string;
  severity: ViolationSeverity;
} {
  const raw = caption.replace(/^Violation:\s*/i, '').trim();
  const code = raw.split(/\s*[-–·]\s*/)[0]?.trim() || raw;
  const label = code
    .replace(/^ai_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const lower = code.toLowerCase();
  let severity: ViolationSeverity = 'warning';
  if (/tab|window|focus|phone|identity|multiple|absent/.test(lower)) severity = 'critical';
  else if (/gaze|looking|sideways|head/.test(lower)) severity = 'warning';
  else severity = 'info';
  return { label, code, severity };
}

export function sessionStatusTone(status?: string): 'active' | 'paused' | 'ended' | 'unknown' {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'in_progress') return 'active';
  if (s === 'paused') return 'paused';
  if (s === 'completed' || s === 'terminated' || s === 'ended') return 'ended';
  return 'unknown';
}

export function formatMatchScore(score: number | null | undefined): string | null {
  if (score == null || Number.isNaN(score)) return null;
  const n = Number(score);
  if (n <= 1) return `${Math.round(n * 100)}%`;
  if (n <= 100) return `${Math.round(n)}%`;
  return `${n.toFixed(1)}`;
}
