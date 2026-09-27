// Central runtime configuration for the Driver App.
//
// Values are read from Expo public env vars (the `EXPO_PUBLIC_` prefix is
// inlined at build time by the Expo/Metro bundler — no extra dependency
// required) with the imported live API as the default.
//
// Configure per environment with a `.env` file at the App/ root, e.g.:
//   EXPO_PUBLIC_API_URL=https://aiviate.olyxee.com/api
//   EXPO_PUBLIC_AIVIATE_API_URL=https://aiviate.olyxee.com/api
//   EXPO_PUBLIC_APP_SCHEME=aviate
//
// In the Replit Preview, both web and Expo Go use the same domain that serves
// the app. Its /api route forwards to a restricted relay for the live service.
// Outside Preview, native builds use the original live API directly.

const DEPLOYED_API = 'https://aiviate.olyxee.com/api';
const PREVIEW_API = process.env.EXPO_PUBLIC_DRIVER_PREVIEW_HOST
  ? `https://${process.env.EXPO_PUBLIC_DRIVER_PREVIEW_HOST}/api/live-driver`
  : null;

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_AIVIATE_API_URL ||
  PREVIEW_API ||
  DEPLOYED_API;

export const DEFAULT_DRIVER_EMAIL = process.env.EXPO_PUBLIC_DEFAULT_DRIVER_EMAIL || '';
export const DEFAULT_DRIVER_PASSWORD = process.env.EXPO_PUBLIC_DEFAULT_DRIVER_PASSWORD || '';

// Deep-link scheme used by activation links (must match app.json `scheme`).
export const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || 'aviate';

// Feature flags — default OFF so the app degrades safely when a boundary
// (safety device, push credentials) is not configured in an environment.
export const FEATURES = {
  // Driver-safety device / detection integration (DEVICE + Call Agent).
  safetyDevice: process.env.EXPO_PUBLIC_FEATURE_SAFETY_DEVICE === 'true',
  // Push notifications (requires Expo push credentials to be configured).
  push: process.env.EXPO_PUBLIC_FEATURE_PUSH === 'true',
};

// Network tuning for the sync queue / http client.
export const NETWORK = {
  requestTimeoutMs: 20000,
  // Exponential backoff bounds for the offline retry queue.
  retryBaseMs: 2000,
  retryMaxMs: 60000,
  maxAttempts: 8,
};

export default { API_URL, DEFAULT_DRIVER_EMAIL, DEFAULT_DRIVER_PASSWORD, APP_SCHEME, FEATURES, NETWORK };
