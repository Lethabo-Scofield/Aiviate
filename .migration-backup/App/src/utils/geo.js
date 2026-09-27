// Geospatial helpers shared by the live-tracking map + Active screen.

const EARTH_RADIUS_M = 6371000;

const toRad = (d) => (d * Math.PI) / 180;

// Great-circle distance in meters between two {lat,lng} points.
export function haversineMeters(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x));
}

// Initial bearing in degrees from north (0 = N, 90 = E, 180 = S, 270 = W).
export function bearingDeg(from, to) {
  if (!from || !to) return 0;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Friendly distance label: "850 m" / "1.2 km".
export function formatMeters(m) {
  if (m == null || isNaN(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Driver is "at" the stop within this radius — used to surface the
// "Arrived — confirm" hint on the primary action button.
export const ARRIVAL_RADIUS_M = 30;
