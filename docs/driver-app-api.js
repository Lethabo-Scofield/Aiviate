/**
 * Aviate Driver App — API Service
 * Drop this file into your React Native project (e.g. src/services/api.js)
 *
 * Set BASE_URL to your deployed backend, e.g.:
 *   https://your-backend.onrender.com
 * For local dev, use your machine's LAN IP:
 *   http://192.168.x.x:8000
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = "http://192.168.128.13:8000";

const TOKEN_KEY = "aiviate_token";
const USER_KEY  = "aiviate_user";

// ─── Auth helpers ───────────────────────────────────────────────────────────

async function getToken() {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

async function headers(json = false) {
  const token = await getToken();
  const h = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (json)  h["Content-Type"]  = "application/json";
  return h;
}

async function handle(res) {
  if (res.status === 401) {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    throw new Error("SESSION_EXPIRED"); // catch this and navigate to Login
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Login with email + password.
 * On success, saves token + user to AsyncStorage.
 * Returns { token, user }
 */
export async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  const data = await handle(res);
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  await AsyncStorage.setItem(USER_KEY,  JSON.stringify(data.user));
  return data;
}

/** Get the currently logged-in user from AsyncStorage (no network call). */
export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Clear credentials and log out. */
export async function logout() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

// ─── Driver jobs ─────────────────────────────────────────────────────────────

/**
 * Fetch all jobs assigned to the logged-in driver.
 * Returns { driver, jobs: [ { id, area, status, stops: [...] } ] }
 *
 * Each stop has:
 *   id, customer_name, address, phone, notes,
 *   stop_number, status ("pending"|"arrived"|"completed"|"failed"),
 *   failed_reason, arrived_at, completed_at
 */
export async function getMyJobs() {
  const res = await fetch(`${BASE_URL}/api/my-jobs`, {
    headers: await headers(),
  });
  return handle(res);
}

// ─── Stop status updates ──────────────────────────────────────────────────────

/**
 * Mark a stop as "arrived" — driver has reached the location.
 * Updates the admin dashboard immediately.
 */
export async function markArrived(stopId) {
  return updateStopStatus(stopId, "arrived");
}

/**
 * Mark a stop as "completed" — delivery done.
 * If this is the last stop, the job is auto-completed too.
 */
export async function markCompleted(stopId) {
  return updateStopStatus(stopId, "completed");
}

/**
 * Mark a stop as "failed" with a reason.
 * @param {string} stopId
 * @param {string} reason  e.g. "No one home", "Wrong address"
 */
export async function markFailed(stopId, reason) {
  return updateStopStatus(stopId, "failed", reason);
}

/**
 * General stop status updater.
 * status: "pending" | "arrived" | "completed" | "failed"
 * Returns { stop: { id, status, arrived_at, completed_at, failed_reason, ... } }
 */
export async function updateStopStatus(stopId, status, reason = "") {
  const res = await fetch(`${BASE_URL}/api/stops/${stopId}/status`, {
    method:  "PATCH",
    headers: await headers(true),
    body:    JSON.stringify({ status, reason }),
  });
  return handle(res);
}

// ─── GPS location ─────────────────────────────────────────────────────────────

/**
 * Push the driver's current GPS position to the backend.
 * Call this on location updates (e.g. every 30–60 seconds while driving).
 * @param {string} driverId  from getStoredUser().driver_id
 * @param {number} lat
 * @param {number} lng
 */
export async function pushLocation(driverId, lat, lng) {
  const res = await fetch(`${BASE_URL}/api/drivers/${driverId}/location`, {
    method:  "POST",
    headers: await headers(true),
    body:    JSON.stringify({ lat, lng }),
  });
  return handle(res);
}

// ─── Job progress ─────────────────────────────────────────────────────────────

/**
 * Get live progress summary for a job.
 * Returns {
 *   job_id, driver_id, total_stops, completed_stops, failed_stops,
 *   arrived_stops, pending_stops, progress_pct,
 *   timing_status ("on_time" | "delayed"),
 *   estimated_time_min, elapsed_min
 * }
 */
export async function getJobProgress(jobId) {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/progress`, {
    headers: await headers(),
  });
  return handle(res);
}
