// OSRM-backed routing helpers.
// fetchOptimizedRoute: planned multi-stop polyline (stop 1 → 2 → 3 → ...).
// fetchLeg: single leg (driver → next stop) with distance/duration metadata,
//           used to draw the live "where to drive next" path.

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export async function fetchOptimizedRoute(stops) {
  if (!stops || stops.length < 2) return null;
  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = await res.json();
    const geom = json?.routes?.[0]?.geometry?.coordinates;
    if (!geom) return null;
    return geom.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch (e) {
    return null;
  }
}

// Fetch the driver-to-stop leg. Returns { path, distanceMeters, durationSeconds }
// or null on failure. `from` and `to` are { lat, lng }.
export async function fetchLeg(from, to) {
  if (!from || !to) return null;
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = await res.json();
    const route = json?.routes?.[0];
    const geom = route?.geometry?.coordinates;
    if (!geom) return null;
    return {
      path: geom.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceMeters: route.distance ?? null,
      durationSeconds: route.duration ?? null,
    };
  } catch (e) {
    return null;
  }
}
