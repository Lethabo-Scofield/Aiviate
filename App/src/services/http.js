// Token-aware HTTP client for the Aiviate operational API.
//
// Thin wrapper over fetch that:
//   - prefixes the configured API base URL
//   - attaches the Bearer token from session storage
//   - parses JSON and normalises errors into a typed ApiError
//   - enforces a request timeout (AbortController)
//   - surfaces auth expiry (401) so callers/AuthContext can sign the driver out
//
// It deliberately knows nothing about specific endpoints — see backend.js.

import { API_URL, NETWORK } from '../config';
import { getToken } from './session';

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, data = null, isNetwork = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.isNetwork = isNetwork; // true when the request never reached the server
  }
}

// Callers (AuthContext) register here to be told when the server rejects the
// token so the app can drop to the login screen exactly once.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function joinUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_URL.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export async function request(path, { method = 'GET', body, headers = {}, auth = true, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || NETWORK.requestTimeoutMs);

  const finalHeaders = { Accept: 'application/json', ...headers };
  let payload = body;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body != null && !isForm) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (auth) {
    const token = await getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(joinUrl(path), {
      method,
      headers: finalHeaders,
      body: payload,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    // fetch rejects on network failure / abort — model both as retryable network errors.
    throw new ApiError(
      e.name === 'AbortError' ? 'Request timed out' : 'Network request failed',
      { isNetwork: true, code: e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' },
    );
  }
  clearTimeout(timer);

  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new ApiError('Your session has expired. Please sign in again.', { status: 401, code: 'UNAUTHORIZED' });
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(message, { status: res.status, code: data?.code || null, data });
  }
  return data;
}

export const http = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

export default http;
