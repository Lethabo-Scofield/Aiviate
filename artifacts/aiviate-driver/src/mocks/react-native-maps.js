import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

if (typeof document !== 'undefined' && !document.getElementById('aviate-map-css')) {
  const style = document.createElement('style');
  style.id = 'aviate-map-css';
  style.textContent = `
    .maplibregl-canvas { outline: none; }
    .aviate-pin {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%;
      color: #fff; font-weight: 700; font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      border: 2px solid #fff;
      transition: transform 200ms ease;
      cursor: pointer;
    }
    .aviate-pin.pickup  { background: #008080; }
    .aviate-pin.dropoff { background: #0F2A3D; }
    .aviate-pin.done    { background: #9AA8B2; }
    .aviate-pin.active  {
      transform: scale(1.25);
      box-shadow: 0 0 0 6px rgba(0,128,128,0.25), 0 4px 10px rgba(0,0,0,0.4);
    }
    .aviate-puck {
      width: 22px; height: 22px; border-radius: 50%;
      background: #1E88FF; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(30,136,255,0.22), 0 2px 6px rgba(0,0,0,0.3);
      position: relative;
    }
    .aviate-puck::after {
      content: ''; position: absolute; inset: -14px;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30,136,255,0.35);
      animation: aviate-pulse 1.6s ease-out infinite;
    }
    @keyframes aviate-pulse {
      0%   { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(1.3); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function bearingBetween(from, to) {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const flatten = (style) => {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style;
};

function collectChildren(children) {
  const markers = [];
  const polylines = [];
  React.Children.forEach(children, (child) => {
    if (!child || !child.props) return;
    if (child.type && child.type.__aviateKind === 'marker') {
      markers.push(child.props);
    } else if (child.type && child.type.__aviateKind === 'polyline') {
      polylines.push(child.props);
    }
  });
  // First polyline is the planned route, optional second is the live driver leg.
  return { markers, polyline: polylines[0] || null, leg: polylines[1] || null };
}

const MapView = ({
  children,
  style,
  initialRegion,
  region,
  fitToPoints,
  focusCoord,
  focusZoom = 16,
  driverLocation = null,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjsRef = useRef([]);
  const puckRef = useRef(null);
  const [ready, setReady] = useState(false);

  const { markers, polyline, leg } = useMemo(() => collectChildren(children), [children]);

  const center = initialRegion || region || { latitude: -26.1, longitude: 28.05 };
  const cLat = center.latitude ?? center.lat;
  const cLng = center.longitude ?? center.lng;

  // Camera target priority during nav: driver position > focus stop.
  const navTarget = driverLocation || focusCoord;

  // Bearing target = driver heading toward next stop. Falls back to
  // prev→stop bearing when no driver location is available.
  const desiredBearing = useMemo(() => {
    if (!focusCoord) return 0;
    if (driverLocation) {
      return bearingBetween(driverLocation, focusCoord);
    }
    const idx = markers.findIndex(
      (m) => Math.abs(m.coordinate.latitude - focusCoord.lat) < 1e-6
          && Math.abs(m.coordinate.longitude - focusCoord.lng) < 1e-6,
    );
    if (idx === -1) return 0;
    const prev = markers[idx - 1];
    if (prev) {
      return bearingBetween(
        { lat: prev.coordinate.latitude, lng: prev.coordinate.longitude },
        focusCoord,
      );
    }
    return 0;
  }, [focusCoord, driverLocation, markers]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [cLng, cLat],
      zoom: navTarget ? focusZoom : 12,
      pitch: navTarget ? 60 : 0,
      bearing: navTarget ? desiredBearing : 0,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      markerObjsRef.current.forEach((m) => m.remove());
      markerObjsRef.current = [];
      if (puckRef.current) { puckRef.current.remove(); puckRef.current = null; }
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync stop markers.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markerObjsRef.current.forEach((m) => m.remove());
    markerObjsRef.current = markers.map((p) => {
      const el = document.createElement('div');
      el.className = `aviate-pin ${p.variant || 'pickup'} ${p.active ? 'active' : ''}`;
      el.textContent = p.label || '';
      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.coordinate.longitude, p.coordinate.latitude])
        .addTo(mapRef.current);
    });
  }, [ready, markers]);

  // Sync route polyline.
  useEffect(() => {
    if (!ready || !mapRef.current || !polyline) return;
    const map = mapRef.current;
    const coords = (polyline.coordinates || []).map((c) => [c.longitude, c.latitude]);
    if (coords.length < 2) return;

    const data = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
    if (map.getSource('aviate-route')) {
      map.getSource('aviate-route').setData(data);
    } else {
      map.addSource('aviate-route', { type: 'geojson', data });
      map.addLayer({
        id: 'aviate-route-casing',
        type: 'line',
        source: 'aviate-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'aviate-route-line',
        type: 'line',
        source: 'aviate-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': polyline.strokeColor || '#008080',
          'line-width': polyline.strokeWidth || 6,
        },
      });
    }
  }, [ready, polyline]);

  // Sync the live "you → next stop" leg as a distinct dashed blue line on top
  // of the planned teal route.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const coords = leg?.coordinates ? leg.coordinates.map((c) => [c.longitude, c.latitude]) : [];
    const data = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    };
    if (map.getSource('aviate-leg')) {
      map.getSource('aviate-leg').setData(data);
    } else {
      map.addSource('aviate-leg', { type: 'geojson', data });
      map.addLayer({
        id: 'aviate-leg-casing',
        type: 'line',
        source: 'aviate-leg',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'aviate-leg-line',
        type: 'line',
        source: 'aviate-leg',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#1E88FF',
          'line-width': 5,
          'line-dasharray': [1.6, 1.2],
        },
      });
    }
  }, [ready, leg]);

  // Sync driver puck.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!driverLocation) {
      if (puckRef.current) { puckRef.current.remove(); puckRef.current = null; }
      return;
    }
    if (!puckRef.current) {
      const el = document.createElement('div');
      el.className = 'aviate-puck';
      puckRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .addTo(mapRef.current);
    } else {
      puckRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    }
  }, [ready, driverLocation && driverLocation.lat, driverLocation && driverLocation.lng]);

  // Camera updates.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    if (navTarget) {
      map.easeTo({
        center: [navTarget.lng, navTarget.lat],
        zoom: focusZoom,
        pitch: 60,
        bearing: desiredBearing,
        duration: 800,
        essential: true,
      });
    } else if (fitToPoints && fitToPoints.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      fitToPoints.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 50, pitch: 0, bearing: 0, duration: 800 });
    }
  }, [
    ready,
    navTarget && navTarget.lat,
    navTarget && navTarget.lng,
    focusZoom,
    desiredBearing,
    fitToPoints,
  ]);

  return (
    <div style={{ ...flatten(style), overflow: 'hidden', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

const Marker = () => null;
Marker.__aviateKind = 'marker';

const Polyline = () => null;
Polyline.__aviateKind = 'polyline';

const Callout = () => null;
const Circle = () => null;
const Polygon = () => null;
const Overlay = () => null;
const PROVIDER_GOOGLE = 'google';
const PROVIDER_DEFAULT = null;

export default MapView;
export { Marker, Polyline, Callout, Circle, Polygon, Overlay, PROVIDER_GOOGLE, PROVIDER_DEFAULT };
