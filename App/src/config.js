// Central runtime configuration for the Driver App.
//
// Values are read from Expo public env vars (the `EXPO_PUBLIC_` prefix is
// inlined at build time by the Expo/Metro bundler — no extra dependency
// required) with safe local-development fallbacks.
//
// Configure per environment with a `.env` file at the App/ root, e.g.:
//   EXPO_PUBLIC_API_URL=https://api.aiviate.example.com/api
//   EXPO_PUBLIC_AIVIATE_API_URL=https://api.aiviate.example.com/api
//   EXPO_PUBLIC_APP_SCHEME=aviate
//
// NOTE for native devices: `localhost` points at the phone, not your machine.
// When testing the backend on your laptop, set EXPO_PUBLIC_API_URL to your
// LAN IP (e.g. http://192.168.1.10:8000/api) or a tunnel URL.

import { Platform } from 'react-native';

const DEFAULT_WEB_API = 'http://localhost:8000/api';
// Android emulator maps the host machine to 10.0.2.2; iOS simulator can use
// localhost. Real devices must override via EXPO_PUBLIC_API_URL.
const DEFAULT_NATIVE_API =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000/api' : 'http://localhost:8000/api';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_AIVIATE_API_URL ||
  (Platform.OS === 'web' ? DEFAULT_WEB_API : DEFAULT_NATIVE_API);

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
