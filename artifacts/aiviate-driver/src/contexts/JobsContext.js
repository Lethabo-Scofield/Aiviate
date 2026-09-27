import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as backend from '../services/backend';
import { validateProof, ProofError } from '../services/api';
import { syncQueue } from '../services/syncQueue';
import { useAuth } from './AuthContext';

const JobsContext = createContext();

export const useJobs = () => {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within JobsProvider');
  return ctx;
};

// Local overlay of driver-side acceptance/start state, keyed by route id, kept
// in AsyncStorage. The backend tracks unassigned|assigned|completed and
// per-stop completion; acceptance and "started" are driver UX states the
// current backend endpoints don't model, so we persist them client-side and
// layer them over the server-derived status. Per-stop completion still flows
// to the authoritative endpoint via the sync queue.
const OVERLAY_KEY = 'aiviate_route_overlay';

const isActiveStatus = (s) => s === 'assigned' || s === 'in_progress';
export const isActive = (r) => isActiveStatus(r.status);

export const JobsProvider = ({ children }) => {
  const { isSignedIn } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ pending: 0, failed: 0, failedOps: [] });
  const overlayRef = useRef({});
  const reloadRef = useRef(null);

  // Apply the acceptance/start overlay on top of the server-derived status so
  // a freshly-assigned route surfaces as "available" (awaiting acceptance),
  // then assigned → in_progress as the driver acts.
  const withOverlay = useCallback((route) => {
    const ov = overlayRef.current[route.id] || {};
    let status = route.status;
    if (status !== 'completed' && status !== 'in_progress') {
      if (ov.started) status = 'in_progress';
      else if (ov.accepted) status = 'assigned';
      else status = 'available';
    }
    return { ...route, status };
  }, []);

  const persistOverlay = useCallback(async () => {
    await AsyncStorage.setItem(OVERLAY_KEY, JSON.stringify(overlayRef.current));
  }, []);

  const reload = useCallback(async () => {
    if (!isSignedIn) { setRoutes([]); setLoading(false); return; }
    try {
      const { data } = await backend.getRoutes();
      const mapped = data.map(withOverlay);
      setRoutes(mapped);
      setActiveRouteId((curr) => curr || mapped.find((r) => r.status === 'in_progress')?.id || null);
    } catch (e) {
      // Offline / transient: keep whatever we last had rather than blanking the UI.
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, withOverlay]);

  reloadRef.current = reload;

  // Register the offline processor for stop completions once. It reconstructs a
  // minimal single-stop route so the proof gate re-validates at send time, and
  // uses the op id as the server idempotency key (no double-apply on retry).
  useEffect(() => {
    syncQueue.registerProcessor('completeStop', async (payload, op) => {
      const miniRoute = {
        id: payload.routeId,
        current_stop_index: 0,
        stops: [{ id: payload.stopId, barcode: payload.barcode, lat: payload.lat, lng: payload.lng }],
      };
      await backend.submitStopCompletion(miniRoute, payload.proof, op.id);
      // Refresh authoritative state after a successful sync.
      if (reloadRef.current) reloadRef.current();
    });
    const off = syncQueue.onChange((st) => setSyncStatus(st));
    syncQueue.load();
    syncQueue.start();
    return () => { off(); syncQueue.stop(); };
  }, []);

  // Load the overlay, then (re)load routes whenever auth flips to signed-in.
  useEffect(() => {
    (async () => {
      if (!isSignedIn) { setRoutes([]); setLoading(false); return; }
      try {
        const raw = await AsyncStorage.getItem(OVERLAY_KEY);
        overlayRef.current = raw ? JSON.parse(raw) : {};
      } catch { overlayRef.current = {}; }
      setLoading(true);
      await reload();
    })();
  }, [isSignedIn, reload]);

  const setOverlay = useCallback(async (routeId, patch) => {
    overlayRef.current = {
      ...overlayRef.current,
      [routeId]: { ...(overlayRef.current[routeId] || {}), ...patch },
    };
    await persistOverlay();
    setRoutes((prev) => prev.map((r) => (r.id === routeId ? withOverlay({ ...r, status: baseStatus(r) }) : r)));
  }, [persistOverlay, withOverlay]);

  const accept = useCallback(async (routeId) => {
    await setOverlay(routeId, { accepted: true, rejected: false });
    setActiveRouteId(routeId);
  }, [setOverlay]);

  // Rejection requires a reason. Recorded locally and raised as an incident via
  // the sync queue so the admin side is notified when connectivity allows.
  const reject = useCallback(async (routeId, reason) => {
    if (!reason || !reason.trim()) throw new Error('A rejection reason is required.');
    await setOverlay(routeId, { accepted: false, rejected: true, rejectReason: reason.trim() });
    if (activeRouteId === routeId) setActiveRouteId(null);
    syncQueue.enqueue({
      id: `reject:${routeId}:${Date.now()}`,
      type: 'reportIncident',
      payload: { routeId, kind: 'route_rejected', reason: reason.trim() },
    });
  }, [setOverlay, activeRouteId]);

  const start = useCallback(async (routeId) => {
    await setOverlay(routeId, { accepted: true, started: true });
    setActiveRouteId(routeId);
  }, [setOverlay]);

  // Complete the current stop: validate proof locally (throws ProofError on a
  // bad barcode/geofence — no network needed), optimistically advance, and
  // enqueue the authoritative write. Works fully offline.
  const advance = useCallback(async (routeId, proof) => {
    const route = routes.find((r) => r.id === routeId);
    if (!route) return { data: undefined };

    validateProof(route, proof); // capture-time gate

    const idx = route.current_stop_index;
    const stop = route.stops[idx];
    const opId = `complete:${routeId}:${stop.id}`;

    await syncQueue.enqueue({
      id: opId,
      type: 'completeStop',
      payload: {
        routeId,
        stopId: stop.id,
        barcode: stop.barcode,
        lat: stop.lat,
        lng: stop.lng,
        proof: { ...proof, capturedAt: new Date().toISOString() },
      },
    });

    // Optimistic local update so the UI advances immediately, online or off.
    let updated;
    setRoutes((prev) => prev.map((r) => {
      if (r.id !== routeId) return r;
      const nextIdx = idx + 1;
      const stops = r.stops.map((s, i) => (i === idx ? { ...s, completed: true } : s));
      const finished = nextIdx >= r.stops.length;
      updated = { ...r, stops, current_stop_index: finished ? r.stops.length : nextIdx, status: finished ? 'completed' : 'in_progress' };
      return updated;
    }));
    if (updated?.status === 'completed') setActiveRouteId(null);
    return { data: updated };
  }, [routes]);

  const newRoutes = routes.filter((r) => r.status === 'available');
  const assignedRoutes = routes.filter(isActive);
  const activeRoute =
    routes.find((r) => r.id === activeRouteId) ||
    routes.find(isActive) ||
    null;

  return (
    <JobsContext.Provider
      value={{
        routes,
        newRoutes,
        assignedRoutes,
        activeRoute,
        loading,
        syncStatus,
        accept,
        reject,
        start,
        advance,
        setActiveRouteId,
        reload,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
};

// Server-derived base status (ignores the overlay), used when re-applying the
// overlay to a route already in state.
function baseStatus(r) {
  const completed = r.stops.filter((s) => s.completed).length;
  if (r.stops.length > 0 && completed === r.stops.length) return 'completed';
  if (completed > 0) return 'in_progress';
  return 'assigned';
}

export { ProofError };
