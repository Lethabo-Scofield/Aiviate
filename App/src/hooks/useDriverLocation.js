// Cross-platform live driver location.
//
// Wraps expo-location's foreground watcher so the same hook works on web
// (browser geolocation prompt → navigator.geolocation under the hood) and
// on iOS/Android (real GPS).
//
// Lifecycle is owned by the `enabled` flag — pass `enabled={true}` only
// while the driver is actively executing a trip; the hook will request
// permission on mount, start streaming positions, and stop cleanly when
// disabled or unmounted.
//
// Returns:
//   coords  – { lat, lng, heading, speed, accuracy, ts } | null
//   status  – 'idle' | 'requesting' | 'watching' | 'denied' | 'unavailable' | 'error'
//   error   – string | null
//   retry() – re-request permission and resume streaming after a denial

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as backend from '../services/backend';
import { haversineMeters } from '../utils/geo';

const WATCH_OPTIONS = {
  accuracy: Location.Accuracy.High,
  // Stream at most every 2 s OR every 5 m of movement, whichever comes first.
  timeInterval: 2000,
  distanceInterval: 5,
};

// How often we push a position to the server. High-frequency local updates
// drive the map smoothly, but we only upload periodically to save battery and
// data — every 15 s or 75 m of movement, whichever comes first.
const UPLOAD_MIN_INTERVAL_MS = 15000;
const UPLOAD_MIN_DISTANCE_M = 75;

// `driverId` (optional): when provided, positions are streamed to the backend
// while `enabled` — and only while enabled, so tracking stops when the
// route/shift ends. Uploads are best-effort telemetry (fire-and-forget); they
// are throttled and never block the UI or the local watcher.
export function useDriverLocation({ enabled = false, driverId = null } = {}) {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const subRef = useRef(null);
  const cancelledRef = useRef(false);
  const lastUploadRef = useRef({ ts: 0, lat: null, lng: null });

  const maybeUpload = useCallback((c) => {
    if (!driverId || !c) return;
    const now = Date.now();
    const prev = lastUploadRef.current;
    const moved = prev.lat != null ? haversineMeters({ lat: prev.lat, lng: prev.lng }, c) : Infinity;
    if (now - prev.ts < UPLOAD_MIN_INTERVAL_MS && moved < UPLOAD_MIN_DISTANCE_M) return;
    lastUploadRef.current = { ts: now, lat: c.lat, lng: c.lng };
    backend.updateLocation(driverId, c).catch(() => { /* offline / best-effort */ });
  }, [driverId]);

  const stop = useCallback(() => {
    if (subRef.current) {
      try { subRef.current.remove(); } catch (_) { /* noop */ }
      subRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setError(null);
    setStatus('requesting');

    try {
      const services = await Location.hasServicesEnabledAsync().catch(() => true);
      if (!services) {
        setStatus('unavailable');
        setError('Location services are off');
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus('denied');
        setError('Location permission denied');
        return;
      }
      if (cancelledRef.current) return;

      // Seed an immediate reading so the UI doesn't sit blank waiting for the first watch tick.
      try {
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelledRef.current) {
          const c = {
            lat: first.coords.latitude,
            lng: first.coords.longitude,
            heading: first.coords.heading ?? null,
            speed: first.coords.speed ?? null,
            accuracy: first.coords.accuracy ?? null,
            ts: first.timestamp,
          };
          setCoords(c);
          maybeUpload(c);
        }
      } catch (_) { /* keep streaming below */ }

      const sub = await Location.watchPositionAsync(WATCH_OPTIONS, (pos) => {
        setStatus('watching');
        const c = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
          accuracy: pos.coords.accuracy ?? null,
          ts: pos.timestamp,
        };
        setCoords(c);
        maybeUpload(c);
      });

      if (cancelledRef.current) {
        try { sub.remove(); } catch (_) {}
        return;
      }
      subRef.current = sub;
      setStatus('watching');
    } catch (e) {
      setStatus('error');
      setError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cancelledRef.current = true;
      stop();
      setStatus('idle');
      setCoords(null);
      return;
    }
    start();
    return () => {
      cancelledRef.current = true;
      stop();
    };
  }, [enabled, start, stop]);

  return { coords, status, error, retry: start };
}
