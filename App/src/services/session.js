// Secure-ish session storage for the driver's auth token and cached profile.
//
// Tokens are persisted with AsyncStorage so the session survives app restarts
// (see App.js session restoration). AsyncStorage is not encrypted at rest;
// for production hardening swap the two `storage` calls below for
// `expo-secure-store` (Keychain / Keystore). The rest of the app only depends
// on this module's async interface, so that swap is isolated here.

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'aiviate_token';
const USER_KEY = 'aiviate_user';

let cachedToken = null; // in-memory fast path for the http client

export async function saveSession({ token, user }) {
  cachedToken = token || null;
  const ops = [];
  if (token) ops.push(AsyncStorage.setItem(TOKEN_KEY, token));
  if (user) ops.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));
  await Promise.all(ops);
}

export async function getToken() {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function getUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearSession() {
  cachedToken = null;
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

// Test/reset hook — clears the in-memory fast-path cache without touching disk.
export function _resetTokenCache() {
  cachedToken = null;
}
