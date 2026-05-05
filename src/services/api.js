const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
// Stop status update (arrived | completed | failed | pending)
export async function updateStopStatus(stopId, status, reason = "") {
  const res = await fetch(`${API_BASE}/stops/${stopId}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ status, reason }),
  });
  return handleResponse(res);
}

// Driver GPS location ingestion
export async function updateDriverLocation(driverId, lat, lng) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}/location`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ lat, lng }),
  });
  return handleResponse(res);
}

export async function getDriverLocation(driverId) {
  const res = await fetch(`${API_BASE}/drivers/${driverId}/location`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

// Route progress retrieval
export async function getJobProgress(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/progress`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

// Reassign a job to a different driver with re-optimisation
export async function reassignDriver(jobId, driverId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/reassign`, {
    method: 'POST',
    headers: getAuthHeaders('application/json'),
    body: JSON.stringify({ driver_id: driverId }),
  });
  return handleResponse(res);
}
export async function loadTestData() {
  const res = await fetch(`${API_BASE}/test-data`, {
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
  const res = await fetch(`${API_BASE}/stats`, { headers: getAuthHeaders() });
  return handleResponse(res);
}
