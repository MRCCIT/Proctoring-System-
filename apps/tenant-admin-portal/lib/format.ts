export function formatCount(n: number | string | undefined): string {
  const v = typeof n === 'string' ? parseInt(n, 10) : Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString();
}

export function formatBytes(bytes: number | string | undefined): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : Number(bytes);
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDayShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}
