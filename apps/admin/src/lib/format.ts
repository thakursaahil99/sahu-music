/** "5 min ago", "3 days ago", or "Never" for an empty date. */
export function ago(value: unknown): string {
  if (!value) return 'Never';
  const t = new Date(String(value)).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} day${d === 1 ? '' : 's'} ago`;
  return dateTime(value, false);
}

/** Local date (and time) in Indian English format. */
export function dateTime(value: unknown, withTime = true): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}
