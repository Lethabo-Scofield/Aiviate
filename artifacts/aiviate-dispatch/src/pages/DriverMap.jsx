import { useCallback, useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowUpRight, Clock3, MapPin, MapPinOff, Route, RotateCcw } from "lucide-react";
import { getLiveOperations, getRoadRoute } from "../services/api";

const JOHANNESBURG = [-26.2041, 28.0473];
const REFRESH_MS = 20000;
const INK = "#233b41";
const ROUTE_COLOR = "#216d76";

function validPoint(lat, lng) {
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined &&
    lat !== "" && lng !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 &&
    !(Number(lat) === 0 && Number(lng) === 0);
}

function pointOf(item) {
  return validPoint(item?.lat, item?.lng) ? [Number(item.lat), Number(item.lng)] : null;
}

// /live-ops may include moving synthetic placeholders. Never treat those as GPS.
function reportedPoint(driver) {
  return driver?.position_source === "reported" ? pointOf(driver) : null;
}

function relativeTime(value) {
  if (!value) return "time not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time not provided";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusLabel(status) {
  return String(status || "unknown").replaceAll("_", " ");
}

function markerIcon(number, selected) {
  return L.divIcon({
    className: "aiviate-driver-marker",
    html: `<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 12px sans-serif;background:${selected ? INK : "#f8f7f1"};color:${selected ? "#f8f7f1" : INK};border:2px solid ${INK};box-shadow:0 2px 6px rgba(27,47,53,.22)">${number}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

// OSRM returns Google's precision-5 encoded polyline format, not [lat,lng] pairs.
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const values = [];
    for (let coordinate = 0; coordinate < 2; coordinate++) {
      let result = 0;
      let shift = 0;
      let value;
      do {
        if (index >= encoded.length || shift > 30) throw new Error("Road routing returned invalid geometry.");
        value = encoded.charCodeAt(index++) - 63;
        if (value < 0 || value > 63) throw new Error("Road routing returned invalid geometry.");
        result |= (value & 31) << shift;
        shift += 5;
      } while (value >= 32);
      values.push(result & 1 ? ~(result >> 1) : result >> 1);
    }
    lat += values[0];
    lng += values[1];
    const point = [lat / 1e5, lng / 1e5];
    if (!validPoint(...point) || points.length >= 50000) throw new Error("Road routing returned invalid geometry.");
    points.push(point);
  }
  if (points.length < 2) throw new Error("Road routing returned no usable road geometry.");
  return points;
}

function MapFocus({ drivers, selectedId, selectedDriver }) {
  const map = useMap();
  const initialized = useRef(false);
  const selected = useRef(selectedDriver);
  selected.current = selectedDriver;

  useEffect(() => {
    if (initialized.current || !drivers) return;
    const known = [...drivers.map(reportedPoint), ...drivers.map((d) => pointOf(d.next_stop))].filter(Boolean);
    if (!known.length) return; // Keep Johannesburg until the first real point arrives.
    initialized.current = true;
    if (known.length > 1) map.fitBounds(known, { padding: [42, 42], maxZoom: 12 });
    else if (known.length === 1) map.setView(known[0], 12);
  }, [drivers, map]);

  useEffect(() => {
    if (selectedId == null) return;
    const start = reportedPoint(selected.current);
    const stop = pointOf(selected.current?.next_stop);
    if (start && stop) map.flyToBounds([start, stop], { padding: [64, 64], maxZoom: 13, duration: 0.65 });
    else if (start || stop) map.flyTo(start || stop, 13, { duration: 0.65 });
  }, [selectedId, map]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function RoadPointPicker({ enabled, onPick }) {
  useMapEvents({
    click(event) {
      if (enabled) onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function roadState(driver, selected, route) {
  if (!reportedPoint(driver)) return "Waiting for reported GPS";
  if (!pointOf(driver.next_stop)) return driver.next_stop ? "Destination has no coordinates" : "No next destination";
  if (!selected) return "Road check available";
  if (route?.phase === "checking") return "Searching roads";
  if (route?.phase === "ready") return "Road route found";
  if (route?.phase === "error") return "Road search unavailable";
  return "Road check available";
}

export default function DriverMap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [routeRetry, setRouteRetry] = useState(0);
  const [route, setRoute] = useState(null);
  const [roadPickMode, setRoadPickMode] = useState(false);
  const [manualPoints, setManualPoints] = useState([]);
  const inFlight = useRef(false);
  const pickRoadPoint = useCallback((point) => {
    setManualPoints((points) => points.length >= 2 ? [point] : [...points, point]);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const response = await getLiveOperations();
        if (active) {
          setData(response);
          setError("");
        }
      } catch (err) {
        if (active) setError(err?.message || "Could not load driver locations.");
      } finally {
        inFlight.current = false;
        if (active) setLoading(false);
      }
    };
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => { active = false; window.clearInterval(interval); };
  }, [refreshKey]);

  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const selectedDriver = drivers.find((d) => String(d.driver_id) === String(selectedId)) || drivers[0] || null;
  const selectedPosition = reportedPoint(selectedDriver);
  const destination = pointOf(selectedDriver?.next_stop);
  const selectedKey = selectedDriver && selectedPosition && destination
    ? `${selectedDriver.driver_id}:${selectedPosition.join(",")}:${destination.join(",")}`
    : null;
  const manualReady = roadPickMode && manualPoints.length === 2;
  const routeStart = roadPickMode ? manualPoints[0] : selectedPosition;
  const routeEnd = roadPickMode ? manualPoints[1] : destination;
  const routeKey = roadPickMode
    ? manualReady ? `manual:${manualPoints[0].join(",")}:${manualPoints[1].join(",")}` : null
    : selectedKey;
  const currentRoute = route?.key === routeKey ? route : null;
  const positioned = drivers.filter((d) => reportedPoint(d));

  const startLat = routeStart?.[0];
  const startLng = routeStart?.[1];
  const stopLat = routeEnd?.[0];
  const stopLng = routeEnd?.[1];
  useEffect(() => {
    if (!routeKey || !validPoint(startLat, startLng) || !validPoint(stopLat, stopLng)) {
      setRoute(null);
      return;
    }
    const controller = new AbortController();
    setRoute({ key: routeKey, phase: "checking" });
    getRoadRoute([[startLat, startLng], [stopLat, stopLng]], { signal: controller.signal })
      .then((result) => {
        const points = decodePolyline(result.geometry);
        if (!controller.signal.aborted) setRoute({ key: routeKey, phase: "ready", points, distance: Number(result.distance), duration: Number(result.duration) });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setRoute({ key: routeKey, phase: "error", message: err?.message || "Road check failed." });
      });
    return () => controller.abort();
  }, [routeKey, startLat, startLng, stopLat, stopLng, routeRetry]);

  const agentActivity = roadPickMode
    ? manualPoints.length === 0 ? "Select a starting point on the map"
      : manualPoints.length === 1 ? "Select a destination on the map"
        : currentRoute?.phase === "checking" ? "Searching roads between chosen points"
          : currentRoute?.phase === "ready" ? "Road route found between chosen points"
            : currentRoute?.phase === "error" ? `Road search failed · ${currentRoute.message}` : "Preparing road search"
    : selectedDriver ? `${selectedDriver.driver_name} · ${roadState(selectedDriver, true, currentRoute)}` : "Waiting for a driver";

  return (
    <section className="min-w-0 text-[#25383c]" aria-label="Driver map and road routing">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-[#25383c]">Driver map</h2>
          <p className="text-[12px] text-[#687a7d]">Reported locations and next stops on OpenStreetMap.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#65777b]">
          <Clock3 size={13} />
          <span data-testid="text-map-updated">{data?.server_time ? `Snapshot ${relativeTime(data.server_time)}` : "Awaiting snapshot"} · refreshes every 20 sec</span>
        </div>
      </div>

      {error && <div role="alert" data-testid="status-map-error" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#ddc9bd] bg-[#f8f0e9] px-3 py-2 text-[12px] text-[#765143]">
        <span>{data ? "Locations may be out of date. " : ""}{error}</span>
        <button data-testid="button-retry-driver-map" type="button" onClick={() => setRefreshKey((key) => key + 1)} className="font-semibold underline underline-offset-2">Retry</button>
      </div>}

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-w-0 overflow-hidden rounded-lg border border-[#d5dfda] bg-[#e5e9df] h-[min(67dvh,760px)] min-h-[390px] sm:h-[min(74dvh,850px)] lg:h-[calc(100dvh-205px)] lg:min-h-[560px]">
          <MapContainer center={JOHANNESBURG} zoom={11} scrollWheelZoom={true} zoomControl={true} style={{ width: "100%", height: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
            <MapFocus drivers={data ? drivers : null} selectedId={selectedId} selectedDriver={selectedDriver} />
            <RoadPointPicker enabled={roadPickMode} onPick={pickRoadPoint} />
            {currentRoute?.phase === "ready" && routeStart && routeEnd && (
              <Polyline positions={currentRoute.points} pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
            )}
            {positioned.map((driver) => {
              const number = drivers.findIndex((d) => String(d.driver_id) === String(driver.driver_id)) + 1;
              return <Marker key={driver.driver_id} position={reportedPoint(driver)} icon={markerIcon(number, String(selectedDriver?.driver_id) === String(driver.driver_id))} eventHandlers={{ click: () => setSelectedId(driver.driver_id) }}>
                <Popup><strong>{driver.driver_name}</strong><br />Reported location · {statusLabel(driver.status)}<br />Updated {relativeTime(driver.location_updated_at)}</Popup>
              </Marker>;
            })}
            {!roadPickMode && destination && <CircleMarker center={destination} radius={8} pathOptions={{ color: ROUTE_COLOR, weight: 3, fillColor: "#f9f8f2", fillOpacity: 1 }}>
              <Popup><strong>Next stop · {selectedDriver?.driver_name}</strong><br />{selectedDriver?.next_stop?.customer_name || selectedDriver?.next_stop?.address || "Assigned stop"}</Popup>
            </CircleMarker>}
            {roadPickMode && manualPoints.map((point, index) => (
              <CircleMarker key={index} center={point} radius={8} pathOptions={{ color: index ? ROUTE_COLOR : INK, weight: 3, fillColor: "#fff", fillOpacity: 1 }}>
                <Popup>{index ? "Chosen destination" : "Chosen start"} · Road check only, not a driver location</Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          {roadPickMode && <div data-testid="status-road-picker" className="pointer-events-none absolute right-3 top-3 z-[500] max-w-[220px] rounded-md border border-[#d9e1da] bg-[#f8f8f3]/95 px-3 py-2 text-[12px] leading-snug text-[#42565a] shadow-sm">
            {manualPoints.length === 0 ? "Tap a starting point on the map." : manualPoints.length === 1 ? "Tap a destination to search real roads." : "Tap again to start a new road check."}
          </div>}
          {positioned.length === 0 && data && !roadPickMode && (
            <div data-testid="status-no-driver-locations" className="pointer-events-none absolute left-3 top-20 z-[500] max-w-[260px] rounded-md border border-[#d9e1da] bg-[#f8f8f3]/95 px-3 py-2 text-[12px] leading-snug text-[#42565a] shadow-sm">
              No reported driver GPS yet. Showing streets{drivers.some((d) => pointOf(d.next_stop)) ? " and known next stops" : " around Johannesburg"}.
            </div>
          )}
          <div className="pointer-events-none absolute bottom-6 left-3 z-[500] max-w-[calc(100%-24px)] rounded-md border border-[#d9e1da] bg-[#f8f8f3]/95 px-3 py-2 text-[11px] leading-snug text-[#41575b] shadow-sm">
            {roadPickMode ? "Chosen points · road check only, not driver tracking" : <><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#233b41] align-middle" /> <span className="mr-3">Reported GPS</span><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#216d76] bg-[#f8f8f3] align-middle" /> <span>Selected next stop</span></>}
            {currentRoute?.phase === "ready" && <span className="block mt-1 text-[#216d76]">Road route · {(currentRoute.distance / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km · approx. {Math.max(1, Math.round(currentRoute.duration / 60))} min</span>}
          </div>
        </div>

        <aside className="min-w-0 rounded-lg border border-[#dce3dd] bg-[#f7f8f3] lg:flex lg:max-h-[calc(100dvh-205px)] lg:min-h-[560px] lg:flex-col">
          <div className="border-b border-[#dce3dd] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-[#263b3f]">Road agent</h3>
              <span className="text-[10px] text-[#71817e]">{currentRoute?.phase === "checking" ? "Searching roads" : currentRoute?.phase === "ready" ? "Route found" : "Standing by"}</span>
            </div>
            <p data-testid="status-agent-activity" className="mt-1 text-[11px] text-[#657a75]">{agentActivity}</p>
            <button data-testid="button-check-roads-on-map" type="button" onClick={() => { setRoadPickMode((active) => !active); setManualPoints([]); }} className="mt-2 text-[11px] font-semibold text-[#216d76] underline underline-offset-2">
              {roadPickMode ? "Exit road check" : "Check roads on map"}
            </button>
          </div>
          <div className="flex items-baseline justify-between border-b border-[#dce3dd] px-4 py-3">
            <h3 className="text-[13px] font-semibold text-[#263b3f]">Drivers <span className="ml-1 font-normal text-[#80908d]">{drivers.length}</span></h3>
            <span className="text-[11px] text-[#71817e]">{positioned.length} with GPS</span>
          </div>
          {loading && !data ? (
            <div aria-label="Loading drivers" className="space-y-3 px-4 py-4">
              {[0, 1, 2].map((n) => <div key={n} className="h-14 animate-pulse rounded bg-[#e8ede7]" />)}
            </div>
          ) : drivers.length === 0 ? (
            <div data-testid="status-no-drivers" className="px-5 py-10 text-center"><MapPinOff size={22} className="mx-auto mb-3 text-[#879793]" /><p className="text-[13px] font-medium">No drivers in this snapshot</p><p className="mt-1 text-[12px] text-[#7a8a86]">Streets remain available while location reports are pending.</p></div>
          ) : (
            <div className="overflow-y-auto lg:min-h-0 lg:flex-1">
              {drivers.map((driver, index) => {
                const chosen = String(selectedDriver?.driver_id) === String(driver.driver_id);
                const state = roadState(driver, chosen, chosen ? currentRoute : null);
                return <button key={driver.driver_id} data-testid={`button-select-driver-${driver.driver_id}`} type="button" onClick={() => setSelectedId(driver.driver_id)} aria-pressed={chosen}
                  className={`flex w-full gap-3 border-b border-[#e2e8e1] px-4 py-3 text-left transition-colors hover:bg-[#eef2eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#216d76] ${chosen ? "bg-[#e9f0eb] shadow-[inset_3px_0_0_#216d76]" : ""}`}>
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${chosen ? "bg-[#233b41] text-[#f8f8f3]" : "border border-[#b9c9c5] text-[#40565b]"}`}>{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-[12px] font-semibold text-[#263b3f]">{driver.driver_name}</span>{chosen && <ArrowUpRight size={13} className="shrink-0 text-[#547578]" />}</span>
                    <span className="block text-[11px] text-[#647875]">{statusLabel(driver.status)} · {reportedPoint(driver) ? `GPS ${relativeTime(driver.location_updated_at)}` : "No reported GPS"}</span>
                    <span data-testid={`status-road-agent-${driver.driver_id}`} className={`mt-1 block text-[11px] ${chosen && currentRoute?.phase === "ready" ? "font-medium text-[#216d76]" : "text-[#7a8985]"}`}>{state}</span>
                  </span>
                </button>;
              })}
            </div>
          )}
          {selectedDriver && <div data-testid="panel-selected-driver" className="border-t border-[#dce3dd] px-4 py-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d817b]">Selected driver</div>
            <div className="flex items-baseline justify-between gap-2"><p className="text-[14px] font-semibold text-[#263b3f]">{selectedDriver.driver_name}</p><span className="text-[11px] capitalize text-[#70817c]">{statusLabel(selectedDriver.status)}</span></div>
            {selectedDriver.active_job_area && <p className="mt-0.5 text-[11px] text-[#788883]">{selectedDriver.active_job_area}</p>}
            <div className="mt-3 space-y-3 border-t border-[#dce3dd] pt-3">
              <div className="flex gap-2.5"><MapPin size={15} className="mt-0.5 shrink-0 text-[#657d79]" /><div><p className="text-[12px] font-medium">{selectedPosition ? "Reported location" : "No reported GPS"}</p><p className="text-[11px] text-[#748782]">{selectedPosition ? `Updated ${relativeTime(selectedDriver.location_updated_at)}` : "A driver location has not been reported."}</p></div></div>
              <div className="flex gap-2.5"><Route size={15} className="mt-0.5 shrink-0 text-[#657d79]" /><div><p className="text-[12px] font-medium">Next stop</p>{selectedDriver.next_stop ? <><p data-testid="text-next-destination" className="text-[12px]">{selectedDriver.next_stop.customer_name || "Assigned stop"}</p><p className="text-[11px] text-[#748782]">{selectedDriver.next_stop.address || "Address unavailable"}{!destination ? " · Coordinates unavailable" : ""}</p></> : <p data-testid="status-no-assignment" className="text-[11px] text-[#748782]">No next delivery assigned</p>}</div></div>
            </div>
            <div className="mt-3 border-t border-[#dce3dd] pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium">Road check</p>
                {!roadPickMode && selectedKey && currentRoute?.phase !== "checking" && <button data-testid="button-retry-road-route" type="button" onClick={() => setRouteRetry((n) => n + 1)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#216d76] hover:underline"><RotateCcw size={11} /> Check again</button>}
              </div>
              <p data-testid="status-selected-road-route" className="mt-1 text-[11px] text-[#687c77]">
                {roadState(selectedDriver, true, roadPickMode ? null : currentRoute)}
                {!roadPickMode && currentRoute?.phase === "ready" ? ` · ${(currentRoute.distance / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km · approx. ${Math.max(1, Math.round(currentRoute.duration / 60))} min` : ""}
                {!roadPickMode && currentRoute?.phase === "error" ? ` · ${currentRoute.message}` : ""}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#8a9791]">Road geometry only. No live traffic data or ETA adjustment.</p>
            </div>
          </div>}
        </aside>
      </div>
    </section>
  );
}