// Fake API layer over the in-memory seed data. Mirrors the shape of a real
// REST client (axios-style { data } responses + small artificial delays) so
// screens/contexts can be swapped to a real backend without rewriting them.
//
// Stop completion is HARD-GATED at this layer:
//   - barcode scanned by the driver MUST equal the stop's expected barcode
//   - driver coordinates MUST be within ARRIVAL_RADIUS_M of the stop
// This mirrors what a real backend would enforce so the UI cannot bypass it.

import { routes as seedRoutes, history as seedHistory } from '../data';
import { haversineMeters, ARRIVAL_RADIUS_M } from '../utils/geo';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let routesState = seedRoutes.map((r) => ({
  ...r,
  current_stop_index: 0,
  stops: r.stops.map((s) => ({ ...s, completed: false })),
}));

export const getRoutes = async () => {
  await delay(200);
  return { data: routesState };
};

export const acceptRoute = async (routeId) => {
  await delay(150);
  routesState = routesState.map((r) =>
    r.id === routeId ? { ...r, status: 'assigned' } : r,
  );
  return { data: routesState.find((r) => r.id === routeId) };
};

export const startRoute = async (routeId) => {
  await delay(120);
  routesState = routesState.map((r) =>
    r.id === routeId ? { ...r, status: 'in_progress' } : r,
  );
  return { data: routesState.find((r) => r.id === routeId) };
};

const normalizeBarcode = (s) => String(s || '').trim().toUpperCase();

class ProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProofError';
    this.code = code;
  }
}
export { ProofError };

// Validate the proof-of-delivery payload for the route's *current* stop.
// Throws ProofError on failure; returns the matched stop on success.
export const validateProof = (route, proof) => {
  if (!route) throw new ProofError('NO_ROUTE', 'Route not found.');
  const idx = route.current_stop_index;
  const stop = route.stops[idx];
  if (!stop) throw new ProofError('NO_STOP', 'No active stop on this route.');
  if (!proof) throw new ProofError('NO_PROOF', 'Proof of delivery is required.');

  const { scannedBarcode, driverLocation } = proof;
  if (!scannedBarcode) {
    throw new ProofError('NO_BARCODE', 'A scanned package barcode is required.');
  }
  if (normalizeBarcode(scannedBarcode) !== normalizeBarcode(stop.barcode)) {
    throw new ProofError(
      'BARCODE_MISMATCH',
      `Scanned barcode does not match the package for this stop.`,
    );
  }
  if (
    !driverLocation ||
    typeof driverLocation.lat !== 'number' ||
    typeof driverLocation.lng !== 'number'
  ) {
    throw new ProofError(
      'NO_LOCATION',
      'Driver location is required to confirm proximity.',
    );
  }
  const distance = haversineMeters(driverLocation, { lat: stop.lat, lng: stop.lng });
  if (distance > ARRIVAL_RADIUS_M) {
    throw new ProofError(
      'OUT_OF_RANGE',
      `You must be within ${ARRIVAL_RADIUS_M} m of the stop (currently ${Math.round(distance)} m away).`,
    );
  }
  return stop;
};

export const completeStop = async (routeId, proof) => {
  await delay(150);
  const route = routesState.find((r) => r.id === routeId);
  // Preserve the legacy "unknown route is a no-op" behavior.
  if (!route) return { data: undefined };

  // Hard-gate: validate the proof BEFORE mutating state.
  validateProof(route, proof);

  routesState = routesState.map((r) => {
    if (r.id !== routeId) return r;
    const idx = r.current_stop_index;
    const nextIdx = idx + 1;
    const stops = r.stops.map((s, i) => (i === idx ? { ...s, completed: true } : s));
    const finished = nextIdx >= r.stops.length;
    return {
      ...r,
      stops,
      current_stop_index: finished ? r.stops.length : nextIdx,
      status: finished ? 'completed' : 'in_progress',
    };
  });
  return { data: routesState.find((r) => r.id === routeId) };
};

export const getHistory = async () => {
  await delay(120);
  const totalStops = seedHistory.reduce((s, h) => s + h.stops, 0);
  const totalKm = seedHistory.reduce((s, h) => s + h.distance_km, 0);
  const todayList = seedHistory.filter((h) => h.date.startsWith('Today'));
  return {
    data: {
      todayRoutes: todayList.length,
      todayStops: todayList.reduce((s, h) => s + h.stops, 0),
      todayKm: todayList.reduce((s, h) => s + h.distance_km, 0),
      todayMin: todayList.reduce((s, h) => s + h.duration_min, 0),
      weekRoutes: seedHistory.length,
      weekStops: totalStops,
      weekKm: totalKm,
      history: seedHistory,
    },
  };
};

const ACTIVE_STATUSES = ['assigned', 'in_progress'];
export const isActive = (r) => ACTIVE_STATUSES.includes(r.status);
