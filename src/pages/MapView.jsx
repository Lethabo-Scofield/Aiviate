import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { getJobs } from "../services/api";
import { SkeletonList } from "../components/Loader";
import { Map as MapIcon, Layers, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";

const JOB_COLORS = [
  "#111315", "#008080", "#ff9500", "#007aff", "#ff3b30",
  "#af52de", "#5ac8fa", "#ff2d55", "#34c759", "#a2845e",
  "#30b0c7", "#ff6482", "#ffd60a", "#64d2ff", "#bf5af2",
];

const iconCache = new Map();

function createNumberedIcon(number, color) {
  const key = `${number}-${color}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const icon = L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background: ${color};
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      border: 2.5px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
  iconCache.set(key, icon);
  return icon;
}

function hasValidCoords(s) {
  return typeof s.lat === "number" && typeof s.lng === "number" && !isNaN(s.lat) && !isNaN(s.lng);
}

const depotIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    background: #111315;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    border: 2.5px solid white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.25);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    letter-spacing: -0.5px;
  ">HQ</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

const DEPOT = { lat: -26.2041, lng: 28.0473 };

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

async function fetchOSRMRoute(waypoints) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waypoints }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.success && data.geometry) {
      return decodePolyline(data.geometry);
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      console.warn("Route fetch failed, falling back to straight lines:", e);
    }
  }
  return null;
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, bounds]);
  return null;
}

export default function MapView() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hiddenJobs, setHiddenJobs] = useState(new Set());
  const [showRoutes, setShowRoutes] = useState(true);
  const [routeGeometries, setRouteGeometries] = useState({});
  const [routesLoading, setRoutesLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await getJobs();
        const loadedJobs = res.jobs || [];
        if (cancelled) return;
        setJobs(loadedJobs);

        const geometries = {};
        const missingRoutes = [];

        for (const job of loadedJobs) {
          if (job.route_geometry) {
            geometries[job.id] = decodePolyline(job.route_geometry);
          } else {
            missingRoutes.push(job);
          }
        }

        if (Object.keys(geometries).length > 0) {
          setRouteGeometries({ ...geometries });
        }

        if (missingRoutes.length > 0) {
          setRoutesLoading(true);
          try {
            const routePromises = missingRoutes.map(async (job) => {
              const stops = job.stops || [];
              const sorted = [...stops]
                .sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0))
                .filter(hasValidCoords);
              if (sorted.length === 0) return null;
              const waypoints = [
                [DEPOT.lat, DEPOT.lng],
                ...sorted.map((s) => [s.lat, s.lng]),
                [DEPOT.lat, DEPOT.lng],
              ];
              const route = await fetchOSRMRoute(waypoints);
              if (route) return { id: job.id, route };
              return null;
            });
            const results = await Promise.allSettled(routePromises);
            if (!cancelled) {
              for (const r of results) {
                if (r.status === "fulfilled" && r.value) {
                  geometries[r.value.id] = r.value.route;
                }
              }
              setRouteGeometries({ ...geometries });
            }
          } finally {
            if (!cancelled) setRoutesLoading(false);
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Failed to load map data. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const toggleJob = (jobId) => {
    setHiddenJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const jobColorMap = useMemo(() => {
    const map = {};
    jobs.forEach((j, idx) => { map[j.id] = JOB_COLORS[idx % JOB_COLORS.length]; });
    return map;
  }, [jobs]);

  const visibleJobs = useMemo(() => jobs.filter((j) => !hiddenJobs.has(j.id)), [jobs, hiddenJobs]);

  const bounds = useMemo(() => {
    const points = [[DEPOT.lat, DEPOT.lng]];
    visibleJobs.forEach((job) => {
      const routeGeo = routeGeometries[job.id];
      if (routeGeo) {
        routeGeo.forEach((p) => points.push(p));
      } else {
        (job.stops || []).forEach((s) => {
          if (hasValidCoords(s)) points.push([s.lat, s.lng]);
        });
      }
    });
    return points.length > 1 ? points : [[DEPOT.lat - 0.1, DEPOT.lng - 0.1], [DEPOT.lat + 0.1, DEPOT.lng + 0.1]];
  }, [visibleJobs, routeGeometries]);

  if (loading) {
    return (
      <div>
        <div className="skeleton h-8 w-24 mb-2" />
        <div className="skeleton h-4 w-40 mb-8" />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Map</h1>
        </div>
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#ff3b30] mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight mb-1">Map</h1>
        <p className="text-[14px] text-[#868E96] mt-1 mb-8">Visualize optimized delivery routes</p>
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-4">
            <MapIcon size={24} className="text-[#c7c7cc]" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] text-[#868E96] mb-4">No jobs to display on the map</p>
          <button onClick={() => navigate("/jobs?tab=dispatch")} className="apple-btn apple-btn-primary text-[13px]">
            Create jobs first
          </button>
        </div>
      </div>
    );
  }

  const totalStops = jobs.reduce((sum, j) => sum + (j.stops?.length || 0), 0);
  const totalKm = jobs.reduce((sum, j) => sum + (j.total_distance_km || 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Map</h1>
          <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
            {jobs.length} jobs | {totalStops} stops | {totalKm.toFixed(1)} km total
            {routesLoading && <span className="text-[#868E96] ml-2">Loading routes...</span>}
          </p>
        </div>
        <button
          onClick={() => setShowRoutes(!showRoutes)}
          className="apple-btn apple-btn-secondary text-[12px] py-2 px-3 self-start"
        >
          <Layers size={14} />
          {showRoutes ? "Hide routes" : "Show routes"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 apple-card overflow-hidden relative" style={{ height: "calc(100vh - 220px)", minHeight: "300px" }}>
          {routesLoading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-md rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
              <img src="/logo.png" alt="" className="w-4 h-4 animate-logo-pulse" />
              <span className="text-[12px] font-medium text-[#111315]">Loading road routes...</span>
            </div>
          )}
          <MapContainer
            center={[DEPOT.lat, DEPOT.lng]}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds bounds={bounds} />

            <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon}>
              <Popup>
                <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: "13px" }}>
                  <strong>Depot / HQ</strong>
                  <br />
                  Johannesburg Central
                </div>
              </Popup>
            </Marker>

            {visibleJobs.map((job) => {
              const color = jobColorMap[job.id];
              const stops = job.stops || [];
              const sortedStops = [...stops].sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
              const validStops = sortedStops.filter(hasValidCoords);

              const realRoute = routeGeometries[job.id];
              const fallbackPoints = [
                [DEPOT.lat, DEPOT.lng],
                ...validStops.map((s) => [s.lat, s.lng]),
                [DEPOT.lat, DEPOT.lng],
              ];

              return (
                <span key={job.id}>
                  {showRoutes && (
                    <Polyline
                      positions={realRoute || fallbackPoints}
                      pathOptions={{
                        color: color,
                        weight: realRoute ? 4 : 3,
                        opacity: realRoute ? 0.8 : 0.5,
                        dashArray: realRoute ? null : "8 4",
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  )}

                  {validStops.map((stop) => (
                    <Marker
                      key={stop.id}
                      position={[stop.lat, stop.lng]}
                      icon={createNumberedIcon(stop.stop_number || 0, color)}
                    >
                      <Popup>
                        <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: "13px", minWidth: "160px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                            <span style={{
                              background: color, color: "white", borderRadius: "6px",
                              padding: "1px 7px", fontSize: "10px", fontWeight: 700,
                            }}>{job.area}</span>
                          </div>
                          <strong style={{ fontSize: "14px" }}>#{stop.stop_number} {stop.customer_name}</strong>
                          <br />
                          <span style={{ color: "#868E96", fontSize: "12px" }}>{stop.address}</span>
                          {stop.notes && (
                            <div style={{ marginTop: "4px", fontSize: "11px", color: "#5C636A" }}>
                              {stop.notes}
                            </div>
                          )}
                          {stop.completed && (
                            <div style={{ marginTop: "4px", color: "#34c759", fontSize: "11px", fontWeight: 600 }}>
                              Completed
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </span>
              );
            })}
          </MapContainer>
        </div>

        <div className="lg:col-span-1 space-y-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          <div className="apple-card p-4">
            <p className="text-[11px] font-semibold text-[#868E96] uppercase tracking-wider mb-3">Legend</p>
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#F1F3F5]">
              <div className="w-5 h-5 rounded-md bg-[#111315] flex items-center justify-center">
                <span className="text-white text-[8px] font-bold">HQ</span>
              </div>
              <span className="text-[12px] text-[#111315] font-medium">Depot</span>
            </div>
            <div className="space-y-1">
              {jobs.map((job) => {
                const color = jobColorMap[job.id];
                const isHidden = hiddenJobs.has(job.id);
                const hasRealRoute = !!routeGeometries[job.id];
                return (
                  <button
                    key={job.id}
                    onClick={() => toggleJob(job.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl transition-all text-left ${
                      isHidden ? "opacity-30" : "hover:bg-[#F1F3F5]"
                    }`}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#111315] truncate">{job.area}</p>
                      <p className="text-[10px] text-[#ADB5BD]">
                        {job.total_stops} stops | {job.total_distance_km} km
                        {hasRealRoute && <span className="text-[#868E96]"> | road</span>}
                      </p>
                    </div>
                    {isHidden ? (
                      <EyeOff size={13} className="text-[#DEE2E6] shrink-0" />
                    ) : (
                      <Eye size={13} className="text-[#c7c7cc] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="apple-card p-4">
            <p className="text-[11px] font-semibold text-[#868E96] uppercase tracking-wider mb-3">Summary</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: jobs.length, l: "Jobs" },
                { v: totalStops, l: "Stops" },
                { v: `${totalKm.toFixed(1)}`, l: "km total" },
                { v: jobs.filter((j) => j.status === "assigned").length, l: "Assigned" },
              ].map(({ v, l }) => (
                <div key={l} className="bg-[#F1F3F5] rounded-xl p-2.5 text-center">
                  <p className="text-[14px] font-semibold text-[#111315]">{v}</p>
                  <p className="text-[10px] text-[#ADB5BD]">{l}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="apple-card p-4">
            <p className="text-[11px] font-semibold text-[#868E96] uppercase tracking-wider mb-3">Driver Status</p>
            <div className="space-y-1.5">
              {jobs.map((job) => {
                const color = jobColorMap[job.id];
                return (
                  <div key={job.id} className="flex items-center gap-2 p-1.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-[#111315] font-medium flex-1 truncate">{job.area}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      job.status === "completed" ? "bg-[#34c759]/10 text-[#34c759]" :
                      job.status === "assigned" ? "bg-[#008080]/10 text-[#008080]" :
                      "bg-[#ff9500]/10 text-[#ff9500]"
                    }`}>
                      {job.driver_name || job.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
