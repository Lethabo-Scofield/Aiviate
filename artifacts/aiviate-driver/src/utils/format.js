// Tiny formatters reused across screens.

export function formatDuration(minutes) {
  if (minutes == null || isNaN(minutes)) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatDistanceKm(km) {
  if (km == null || isNaN(km)) return '—';
  return `${Number(km).toFixed(1)} km`;
}
