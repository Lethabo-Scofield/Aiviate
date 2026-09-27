// Real Aiviate backend integration for the Driver App.
//
// This module talks to the existing Flask operational API (Website/backend)
// and adapts its Job/Stop shape into the route/stop shape the app screens
// already consume, so the UI did not need to be rewritten.
//
// The client-side proof-of-delivery gate (barcode match + geofence) is REUSED
// from services/api.js (`validateProof`) so completion is enforced locally
// BEFORE a network call, exactly as it was against the mock layer. The server
// remains authoritative for persistence.

import { http } from './http';
import { validateProof, ProofError } from './api';
import { adaptJob, adaptStop } from './adapters';

export { ProofError, adaptJob, adaptStop };

// ───── Auth ────────────────────────────────────────────────────────────────

export async function login(email, password) {
  // { success, token, user }
  return http.post('/auth/login', { email: String(email || '').trim().toLowerCase(), password }, { auth: false });
}

export async function fetchMe() {
  // { user }
  return http.get('/auth/me');
}

// Activation, forgot- and reset-password call the driver onboarding endpoints.
// These belong to the backend invitation phase; the app is wired to the
// documented contract and degrades clearly (see AuthContext) if the endpoint
// is not yet deployed in an environment.
export async function activateAccount({ token, password }) {
  // { success, token, user }
  return http.post('/auth/activate', { token, password }, { auth: false });
}

export async function requestPasswordReset(email) {
  // Always resolves the same way regardless of whether the account exists —
  // the server must not reveal account existence.
  return http.post('/auth/forgot-password', { email: String(email || '').trim().toLowerCase() }, { auth: false });
}

export async function resetPassword({ token, password }) {
  return http.post('/auth/reset-password', { token, password }, { auth: false });
}

// ───── Route / job data ──────────────────────────────────────────────────
// Job/Stop -> route/stop mapping lives in ./adapters (pure, RN-free).

export async function getRoutes() {
  const res = await http.get('/my-jobs'); // { driver, jobs }
  const routes = (res?.jobs || []).map(adaptJob);
  return { data: routes, driver: res?.driver || null };
}

// ───── Mutations ──────────────────────────────────────────────────────────

// Validate proof locally (throws ProofError), then persist completion to the
// authoritative endpoint. `idempotencyKey` lets the offline queue retry the
// same completion without double-applying it.
export async function submitStopCompletion(route, proof, idempotencyKey) {
  validateProof(route, proof); // barcode + geofence gate, pre-flight
  const idx = route.current_stop_index;
  const stop = route.stops[idx];
  const body = {
    idempotency_key: idempotencyKey || null,
    outcome: proof.outcome || 'delivered',
    recipient_name: proof.recipientName || null,
    scanned_barcode: proof.scannedBarcode || null,
    location: proof.driverLocation || null,
    notes: proof.notes || null,
    delivered_qty: proof.deliveredQty ?? null,
    total_qty: proof.totalQty ?? null,
    reattempt_required: proof.reattemptRequired ?? null,
    // evidence metadata only — binary upload is a separate, resumable step
    evidence: proof.evidence || null,
    client_captured_at: proof.capturedAt || new Date().toISOString(),
  };
  // { success, stop, job_status }
  return http.post(`/my-jobs/${encodeURIComponent(route.id)}/complete/${encodeURIComponent(stop.id)}`, body);
}

export async function updateLocation(driverId, coords) {
  return http.post(`/drivers/${encodeURIComponent(driverId)}/location`, {
    lat: coords.lat,
    lng: coords.lng,
    accuracy: coords.accuracy ?? null,
  });
}

export async function getAlerts() {
  // Reuses the existing alerts endpoint; returns [] shape-tolerantly.
  const res = await http.get('/alerts');
  return Array.isArray(res) ? res : res?.alerts || [];
}

export default {
  login,
  fetchMe,
  activateAccount,
  requestPasswordReset,
  resetPassword,
  getRoutes,
  submitStopCompletion,
  updateLocation,
  getAlerts,
  adaptJob,
  adaptStop,
};
