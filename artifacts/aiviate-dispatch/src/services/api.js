export const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getAuthHeaders(contentType) {
  const headers = {};
  const token = localStorage.getItem("aiviate_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function handleResponse(res) {
  if (res.status === 401) {
    localStorage.removeItem("aiviate_token");
    localStorage.removeItem("aiviate_user");
    window.location.replace("/login");
    throw new Error("Session expired");
  }

  if (res.status === 204) return {};

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected response format (${res.status})`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Invalid JSON response (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function getAgents() {
  const res = await fetch(`${API_BASE}/agents`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getAutopilotStatus() {
  const res = await fetch(`${API_BASE}/autopilot/status`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getWorkspaceMembers() {
  const res = await fetch(`${API_BASE}/workspace/members`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function addWorkspaceMember(payload) {
  const res = await fetch(`${API_BASE}/workspace/members`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function getOperationsSnapshot() {
  const res = await fetch(`${API_BASE}/operations/snapshot`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getVoiceBriefing() {
  const res = await fetch(`${API_BASE}/operations/voice-briefing`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function sendVoiceTurn(recording) {
  const body = new FormData();
  body.append("audio", recording, "voice-message.webm");
  const res = await fetch(`${API_BASE}/operations/voice-turn`, {
    method: "POST",
    headers: getAuthHeaders(),
    body,
  });
  return handleResponse(res);
}

export async function runNewOrderWorkflow() {
  const res = await fetch(`${API_BASE}/operations/run-new-order-workflow`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({}),
  });
  return handleResponse(res);
}

export async function getActivity(limit = 100) {
  const res = await fetch(`${API_BASE}/activity?limit=${limit}`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getExceptions() {
  const res = await fetch(`${API_BASE}/exceptions`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getApprovals() {
  const res = await fetch(`${API_BASE}/approvals`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getPolicies() {
  const res = await fetch(`${API_BASE}/policies`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function updatePolicies(payload) {
  const res = await fetch(`${API_BASE}/policies`, {
    method: "PATCH",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function updateAutopilotSettings(payload) {
  const res = await fetch(`${API_BASE}/autopilot/settings`, {
    method: "PATCH",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function runAutopilot(force = false) {
  const res = await fetch(`${API_BASE}/autopilot/run`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({ force }),
  });
  return handleResponse(res);
}

export async function getRecommendations() {
  const res = await fetch(`${API_BASE}/intelligence/recommendations`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function acknowledgeRecommendation(recId, payload = {}) {
  const res = await fetch(`${API_BASE}/intelligence/recommendations/${encodeURIComponent(recId)}/acknowledge`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function sendCommand(text) {
  const res = await fetch(`${API_BASE}/intelligence/command`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({ text }),
  });
  return handleResponse(res);
}

export async function getAuditLog(limit = 25) {
  const res = await fetch(`${API_BASE}/intelligence/audit-log?limit=${limit}`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function uploadExcel(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  });
  return handleResponse(res);
}

export async function getStoreOrders() {
  const res = await fetch(`${API_BASE}/store/orders`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getStoreIntegration() {
  const res = await fetch(`${API_BASE}/store/integration`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function updateStoreIntegration(payload) {
  const res = await fetch(`${API_BASE}/store/integration`, {
    method: "PUT",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function getIntegrations() {
  const res = await fetch(`${API_BASE}/integrations`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getGmailAuthUrl(payload = {}) {
  const res = await fetch(`${API_BASE}/integrations/gmail/auth-url`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function completeGmailAuth(payload = {}) {
  const res = await fetch(`${API_BASE}/integrations/gmail/callback`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function disconnectIntegration(provider) {
  const res = await fetch(`${API_BASE}/integrations/${encodeURIComponent(provider)}/disconnect`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
  });
  return handleResponse(res);
}

export async function searchGmail(payload = {}) {
  const res = await fetch(`${API_BASE}/integrations/gmail/search`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function replyGmail(messageId, body) {
  const res = await fetch(`${API_BASE}/integrations/gmail/reply`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({ message_id: messageId, body }),
  });
  return handleResponse(res);
}

export async function importStoreOrders(orderIds = null) {
  const res = await fetch(`${API_BASE}/store/orders/import`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify(orderIds ? { order_ids: orderIds } : {}),
  });
  return handleResponse(res);
}

export async function optimizeStops(stops, numDrivers = 4, clusterRadius = 8) {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ stops, num_drivers: numDrivers, cluster_radius: clusterRadius }),
  });
  return handleResponse(res);
}

export async function getJobs() {
  const res = await fetch(`${API_BASE}/jobs`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function assignDriver(jobId, driverId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/assign`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ driver_id: driverId }),
  });
  return handleResponse(res);
}

export async function unassignDriver(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/unassign`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getDrivers() {
  const res = await fetch(`${API_BASE}/drivers`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function addDriver(name, email, vehicleType, password = "") {
  const res = await fetch(`${API_BASE}/drivers`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ name, email, vehicle_type: vehicleType, password }),
  });
  return handleResponse(res);
}

export async function removeDriver(driverId) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getDriverDetail(driverId) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function toggleBlockDriver(driverId) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}/block`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function resetDriverPassword(driverId) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}/reset-password`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getDriverDeliveries(driverId) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}/deliveries`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getMyJobs() {
  const res = await fetch(`${API_BASE}/my-jobs`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function completeMyStop(jobId, stopId) {
  const res = await fetch(`${API_BASE}/my-jobs/${jobId}/complete/${stopId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getDriverJobs(driverId) {
  const res = await fetch(`${API_BASE}/driver/${driverId}/jobs`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function completeStop(driverId, jobId, stopId) {
  const res = await fetch(`${API_BASE}/driver/${driverId}/complete/${jobId}/${stopId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getStops() {
  const res = await fetch(`${API_BASE}/stops`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function createTrackingLink(stopId) {
  const res = await fetch(`${API_BASE}/stops/${encodeURIComponent(stopId)}/tracking-link`, {
    method: 'POST',
    headers: { ...getAuthHeaders('application/json'), 'X-Public-App-Origin': window.location.origin },
    body: JSON.stringify({}),
  });
  return handleResponse(res);
}

export async function revokeTrackingLink(stopId) {
  const res = await fetch(`${API_BASE}/stops/${encodeURIComponent(stopId)}/tracking-link/revoke`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getPublicTracking(token) {
  const res = await fetch(`${API_BASE}/public/tracking/${encodeURIComponent(token)}`);
  return handleResponse(res);
}

export async function requestPublicReschedule(token, requestedWindow) {
  const res = await fetch(`${API_BASE}/public/tracking/${encodeURIComponent(token)}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requested_window: requestedWindow }),
  });
  return handleResponse(res);
}

export async function confirmPublicAvailability(token, available) {
  const res = await fetch(`${API_BASE}/public/tracking/${encodeURIComponent(token)}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ available }),
  });
  return handleResponse(res);
}

export async function getStats() {
  const res = await fetch(`${API_BASE}/stats`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getLiveOperations() {
  const res = await fetch(`${API_BASE}/live-ops`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getRoadRoute(waypoints, { signal } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length !== 2 || !waypoints.every(
    (point) => Array.isArray(point) && point.length === 2 &&
      point.every((value) => typeof value === "number" && Number.isFinite(value)) &&
      Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180 &&
      !(point[0] === 0 && point[1] === 0)
  )) throw new Error("Valid reported location and destination coordinates are required.");
  const res = await fetch(`${API_BASE}/route`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({ waypoints }),
    signal,
  });
  const data = await handleResponse(res);
  if (data.success !== true || typeof data.geometry !== "string" || !data.geometry ||
      !Number.isFinite(Number(data.distance)) || Number(data.distance) < 0 ||
      !Number.isFinite(Number(data.duration)) || Number(data.duration) < 0) {
    throw new Error(data.error || "Road routing returned no usable route.");
  }
  return data;
}

export async function getSafetyOverview() {
  const res = await fetch(`${API_BASE}/safety/overview`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getSafetyEvents() {
  const res = await fetch(`${API_BASE}/safety/events`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getDevices() {
  const res = await fetch(`${API_BASE}/devices`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function addDevice(name, model) {
  const res = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ name, model }),
  });
  return handleResponse(res);
}

export async function assignDevice(deviceId, driverId) {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/assign`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ driver_id: driverId }),
  });
  return handleResponse(res);
}

export async function triggerDeviceOta(deviceId) {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/ota`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function removeDevice(deviceId) {
  const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function getAlerts({ unread = false, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (unread) params.set('unread', 'true');
  params.set('limit', limit);
  const res = await fetch(`${API_BASE}/alerts?${params}`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function markAlertRead(alertId) {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/read`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function markAllAlertsRead() {
  const res = await fetch(`${API_BASE}/alerts/read-all`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function deleteAlert(alertId) {
  const res = await fetch(`${API_BASE}/alerts/${alertId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}
