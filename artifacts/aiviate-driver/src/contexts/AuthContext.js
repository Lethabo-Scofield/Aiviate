// Authentication state for the Driver App.
//
// Owns the session lifecycle: restore-on-launch, sign-in, activation (from a
// deep-link invitation), sign-out, and forced sign-out when the server rejects
// the token (401) or the driver is suspended (403). Everything downstream
// (navigation gating, data fetching) keys off `status`.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

import * as backend from '../services/backend';
import { ApiError, setUnauthorizedHandler } from '../services/http';
import { saveSession, clearSession, getToken, getUser } from '../services/session';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// status: 'restoring' | 'signedOut' | 'signedIn' | 'suspended'
export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState('restoring');
  const [user, setUser] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const applySignedIn = useCallback(async ({ token, user: u }) => {
    await saveSession({ token, user: u });
    if (!mounted.current) return;
    setUser(u);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    if (!mounted.current) return;
    setUser(null);
    setStatus('signedOut');
  }, []);

  // Wire the http client so any 401 anywhere drops us to the login screen once.
  useEffect(() => {
    setUnauthorizedHandler(() => { signOut(); });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Restore a persisted session on launch and re-validate it against the server.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { if (mounted.current) setStatus('signedOut'); return; }
      // Optimistically show the cached user while we validate.
      const cached = await getUser();
      if (cached && mounted.current) setUser(cached);
      try {
        const { user: fresh } = await backend.fetchMe();
        if (!mounted.current) return;
        setUser(fresh);
        setStatus('signedIn');
      } catch (e) {
        if (!mounted.current) return;
        if (e instanceof ApiError && e.status === 403) { setStatus('suspended'); return; }
        // 401 already handled by the unauthorized handler → signedOut.
        if (e instanceof ApiError && e.status === 401) return;
        // Network error at launch: keep the cached session so the app is usable
        // offline; treat as signed-in if we had a cached user, else signed out.
        setStatus(cached ? 'signedIn' : 'signedOut');
      }
    })();
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      const res = await backend.login(email, password);
      await applySignedIn({ token: res.token, user: res.user });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setStatus('suspended');
        return { ok: false, suspended: true, error: e.message };
      }
      return { ok: false, error: e.message || 'Sign in failed' };
    }
  }, [applySignedIn]);

  const activate = useCallback(async ({ token, password }) => {
    try {
      const res = await backend.activateAccount({ token, password });
      await applySignedIn({ token: res.token, user: res.user });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e.message || 'Activation failed',
        // Distinguish "endpoint not deployed yet" from a bad/expired token so
        // the UI can message accordingly.
        notImplemented: e instanceof ApiError && (e.status === 404 || e.status === 501),
      };
    }
  }, [applySignedIn]);

  const forgotPassword = useCallback(async (email) => {
    try {
      await backend.requestPasswordReset(email);
    } catch (e) {
      // Never reveal whether the account exists — succeed either way unless
      // the endpoint itself is missing.
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
        return { ok: false, notImplemented: true };
      }
    }
    return { ok: true };
  }, []);

  const value = {
    status,
    user,
    isSignedIn: status === 'signedIn',
    signIn,
    signOut,
    activate,
    forgotPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
