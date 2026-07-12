const API_BASE = import.meta.env.VITE_API_URL || '/api';
const LOCAL_DEMO_TOKEN = "local-demo-token";
const LOCAL_DEMO_ACTION_DETAILS = {
  title: "Today's dispatch briefing",
  status: "Completed",
  owner: "AgentZero",
  confidence: 99,
  inputs: [
    "23 stops scheduled for today",
    "4 active drivers available",
    "1 unassigned job waiting",
    "3 unread operational alerts",
  ],
  steps: [
    "Checked open routes and driver capacity",
    "Compared unassigned work against available drivers",
    "Scanned unread alerts for anything blocking dispatch",
    "Prepared the first dispatch summary for the operator",
  ],
  outcome: "Briefing is ready. No high-risk change was made without approval.",
  nextFocus: "Assign the 1 waiting job or ask AgentZero to show the best driver match.",
};
const LOCAL_DEMO_ACTION = {
  summary: "Prepared today's dispatch briefing",
  action_type: "autopilot_dispatch_briefing",
  at: new Date().toISOString(),
  details: { focus_action: true, ...LOCAL_DEMO_ACTION_DETAILS },
};
const LOCAL_DEMO_SETTINGS = {
  enabled: true,
  mode: "autonomous",
  max_actions_per_run: 5,
  auto_assign: true,
  auto_optimize: true,
  auto_notify: true,
  safety_approval_required: true,
};
const LOCAL_DEMO_STATS = {
  stops_today: 23,
  active_drivers: 4,
  total_drivers: 5,
  unassigned: 1,
  unread_alerts: 3,
};

function isLocalDemo() {
  return import.meta.env.DEV && localStorage.getItem("aiviate_token") === LOCAL_DEMO_TOKEN;
}

function localDemoAutopilot() {
  return {
    settings: { ...LOCAL_DEMO_SETTINGS },
    recent_actions: [{ ...LOCAL_DEMO_ACTION, at: new Date().toISOString() }],
    pending_approvals: [],
  };
}

function localDemoCommand(text = "") {
  const lower = text.toLowerCase();
  if (lower.includes("autopilot") || lower.includes("handled") || lower.includes("done")) {
    return {
      ok: true,
      type: "autopilot",
      summary: "AgentZero completed 1 autonomous task. Here are the details.",
      settings: { ...LOCAL_DEMO_SETTINGS },
      recent_actions: [{ ...LOCAL_DEMO_ACTION, at: new Date().toISOString() }],
      pending_approvals: [],
    };
  }
  if (lower.includes("route") || lower.includes("today")) {
    return {
      ok: true,
      type: "stats",
      summary: "Today's operation is ready.",
      items: [
        { label: "Stops today", value: LOCAL_DEMO_STATS.stops_today },
        { label: "Active drivers", value: LOCAL_DEMO_STATS.active_drivers },
        { label: "Unassigned jobs", value: LOCAL_DEMO_STATS.unassigned },
      ],
    };
  }
  if (lower.includes("working") || lower.includes("driver")) {
    return {
      ok: true,
      type: "drivers",
      summary: "4 drivers are active.",
      items: [
        { id: "DRV-DEMO001", name: "Thabo Mokoena", status: "available" },
        { id: "DRV-DEMO002", name: "Lerato Dlamini", status: "available" },
        { id: "DRV-DEMO003", name: "Sipho Khumalo", status: "available" },
        { id: "DRV-DEMO004", name: "Naledi Botha", status: "available" },
      ],
    };
  }
  if (lower.includes("problem") || lower.includes("alert")) {
    return {
      ok: true,
      type: "alerts",
      summary: "3 alerts are open for review.",
      items: [
        { id: "ALT-DEMO001", severity: "warning", title: "Delivery Delayed" },
        { id: "ALT-DEMO002", severity: "warning", title: "Route Deviation" },
        { id: "ALT-DEMO003", severity: "info", title: "Device Offline" },
      ],
    };
  }
  return {
    ok: true,
    type: "autopilot",
    summary: "I prepared today's dispatch briefing and I am watching the operation in autonomous mode.",
    settings: { ...LOCAL_DEMO_SETTINGS },
    recent_actions: [{ ...LOCAL_DEMO_ACTION, at: new Date().toISOString() }],
    pending_approvals: [],
  };
}

function getAuthHeaders(contentType) {
  const headers = {};
  const token = localStorage.getItem("aiviate_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function handleResponse(res) {
  if (res.status === 401) {
    if (isLocalDemo()) {
      return {};
    }
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
  if (isLocalDemo()) return localDemoAutopilot();
  const res = await fetch(`${API_BASE}/autopilot/status`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function updateAutopilotSettings(payload) {
  if (isLocalDemo()) return { settings: { ...LOCAL_DEMO_SETTINGS, ...payload } };
  const res = await fetch(`${API_BASE}/autopilot/settings`, {
    method: "PATCH",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function runAutopilot(force = false) {
  if (isLocalDemo()) {
    return {
      enabled: true,
      mode: "autonomous",
      actions: [{ type: "dispatch_briefing", summary: LOCAL_DEMO_ACTION.summary }],
      summary: "Autopilot completed 1 action",
    };
  }
  const res = await fetch(`${API_BASE}/autopilot/run`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({ force }),
  });
  return handleResponse(res);
}

export async function getRecommendations() {
  if (isLocalDemo()) return { recommendations: [] };
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
  if (isLocalDemo()) return localDemoCommand(text);
  const res = await fetch(`${API_BASE}/intelligence/command`, {
    method: "POST",
    headers: getAuthHeaders("application/json"),
    body: JSON.stringify({ text }),
  });
  return handleResponse(res);
}

export async function getAuditLog(limit = 25) {
  if (isLocalDemo()) {
    return {
      entries: [{
        actor: "autopilot",
        action_type: LOCAL_DEMO_ACTION.action_type,
        summary: LOCAL_DEMO_ACTION.summary,
        created_at: new Date().toISOString(),
        details: LOCAL_DEMO_ACTION.details,
      }],
    };
  }
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

export async function getStats() {
  if (isLocalDemo()) return { ...LOCAL_DEMO_STATS };
  const res = await fetch(`${API_BASE}/stats`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function getLiveOps() {
  const res = await fetch(`${API_BASE}/live-ops`, { headers: getAuthHeaders() });
  return handleResponse(res);
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

export async function seedDemoData() {
  const res = await fetch(`${API_BASE}/demo/seed`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}
