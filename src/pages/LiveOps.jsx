import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity,
  Gauge,
  Navigation,
  AlertTriangle,
  Eye,
  Clock,
  MapPinOff,
  Bell,
  Wifi,
  Battery,
} from "lucide-react";
import { getLiveOps } from "../services/api";

const ALERT_ICONS = {
  fatigue: Eye,
  route_deviation: MapPinOff,
  delay: Clock,
  harsh_braking: AlertTriangle,
  speeding: Gauge,
  device_offline: Wifi,
  battery_low: Battery,
};

const ALERT_COLOR = { critical: "#ff3b30", warning: "#ff9500", info: "#0a84ff" };

function driverIcon(status, label) {
  const color = status === "on_route" ? "#34c759" : status === "blocked" ? "#ff3b30" : "#ADB5BD";
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="position:relative;">
        <div style="width:36px;height:36px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;">${label}</div>
        ${status === "on_route" ? `<div style="position:absolute;top:-6px;left:-6px;width:48px;height:48px;border-radius:50%;background:${color};opacity:0.25;animation:pulseGlow 1.8s ease-in-out infinite;"></div>` : ""}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function LiveOps() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await getLiveOps();
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const drivers = data?.drivers || [];
  const alerts = data?.recent_alerts || [];
  const activeCount = drivers.filter((d) => d.status === "on_route").length;

  const selectedDriver = useMemo(
    () => (selected ? drivers.find((d) => d.driver_id === selected) : null),
    [selected, drivers]
  );

  const center = useMemo(() => {
    if (drivers.length === 0) return [-26.2041, 28.0473];
    const lat = drivers.reduce((a, d) => a + d.lat, 0) / drivers.length;
    const lng = drivers.reduce((a, d) => a + d.lng, 0) / drivers.length;
    return [lat, lng];
  }, [drivers]);

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">
          Live Ops
          <span className="text-[14px] font-normal text-[#868E96] ml-3">{activeCount}/{drivers.length} on-route</span>
        </h1>
        <div className="flex items-center gap-2 text-[12px] text-[#868E96]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
          Live
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 apple-card overflow-hidden">
          <div className="h-[560px]">
            {loading && !data ? (
              <div className="h-full flex items-center justify-center">
                <Activity size={28} className="text-[#ADB5BD] animate-pulse" />
              </div>
            ) : (
              <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                />
                {drivers.map((d, i) => (
                  <Marker
                    key={d.driver_id}
                    position={[d.lat, d.lng]}
                    icon={driverIcon(d.status, String(i + 1))}
                    eventHandlers={{ click: () => setSelected(d.driver_id) }}
                  >
                    <Popup>
                      <div className="text-[12px]">
                        <p className="font-semibold text-[#111315]">{d.driver_name}</p>
                        <p className="text-[#868E96]">{d.speed_kmh} km/h • {d.progress_pct}% complete</p>
                        {d.active_job_area && <p className="text-[#868E96]">Route: {d.active_job_area}</p>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {selectedDriver && selectedDriver.next_stop && (
                  <>
                    <CircleMarker
                      center={[selectedDriver.next_stop.lat, selectedDriver.next_stop.lng]}
                      radius={8}
                      pathOptions={{ color: "#0a84ff", fillColor: "#0a84ff", fillOpacity: 0.8 }}
                    >
                      <Popup>Next: {selectedDriver.next_stop.customer_name}</Popup>
                    </CircleMarker>
                    <Polyline
                      positions={[
                        [selectedDriver.lat, selectedDriver.lng],
                        [selectedDriver.next_stop.lat, selectedDriver.next_stop.lng],
                      ]}
                      pathOptions={{ color: "#0a84ff", dashArray: "6 6", weight: 2 }}
                    />
                  </>
                )}
              </MapContainer>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="apple-card p-5">
            <h2 className="text-[14px] font-semibold text-[#111315] mb-3">Drivers</h2>
            {drivers.length === 0 ? (
              <p className="text-[13px] text-[#ADB5BD] py-6 text-center">No drivers active</p>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                {drivers.map((d, i) => {
                  const active = selected === d.driver_id;
                  const dotColor = d.status === "on_route" ? "#34c759" : d.status === "blocked" ? "#ff3b30" : "#ADB5BD";
                  return (
                    <button
                      key={d.driver_id}
                      onClick={() => setSelected(d.driver_id)}
                      className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-colors ${active ? "bg-[#e8e8ed]" : "hover:bg-[#F1F3F5]"}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-[#F1F3F5] text-[11px] font-semibold text-[#343A40] flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#111315] truncate">{d.driver_name}</p>
                        <p className="text-[11px] text-[#868E96]">
                          {d.active_job_area || "Idle"} • {d.progress_pct}%
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
                        <span className="text-[11px] font-semibold text-[#343A40]">{d.speed_kmh}<span className="text-[#ADB5BD] font-normal"> km/h</span></span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedDriver && (
            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-semibold text-[#111315]">{selectedDriver.driver_name}</h2>
                <button onClick={() => setSelected(null)} className="text-[12px] text-[#868E96] hover:text-[#111315]">close</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F1F3F5] rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#868E96] font-semibold">Speed</p>
                  <p className="text-[20px] font-semibold text-[#111315]">{selectedDriver.speed_kmh}<span className="text-[12px] text-[#868E96] font-normal"> km/h</span></p>
                </div>
                <div className="bg-[#F1F3F5] rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#868E96] font-semibold">Progress</p>
                  <p className="text-[20px] font-semibold text-[#111315]">{selectedDriver.progress_pct}%</p>
                  <p className="text-[11px] text-[#ADB5BD]">{selectedDriver.stops_completed}/{selectedDriver.stops_total} stops</p>
                </div>
              </div>
              {selectedDriver.next_stop && (
                <div className="mt-3 p-3 rounded-xl bg-[#0a84ff]/8 border border-[#0a84ff]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Navigation size={12} className="text-[#0a84ff]" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0a84ff]">Next stop</p>
                  </div>
                  <p className="text-[13px] font-medium text-[#111315]">{selectedDriver.next_stop.customer_name}</p>
                  <p className="text-[11px] text-[#868E96] truncate">{selectedDriver.next_stop.address}</p>
                </div>
              )}
            </div>
          )}

          <div className="apple-card p-5">
            <h2 className="text-[14px] font-semibold text-[#111315] mb-3">Alerts</h2>
            {alerts.length === 0 ? (
              <p className="text-[13px] text-[#ADB5BD] py-6 text-center">No alerts</p>
            ) : (
              <div className="space-y-0.5 max-h-[260px] overflow-y-auto">
                {alerts.map((a) => {
                  const Icon = ALERT_ICONS[a.type] || Bell;
                  const color = ALERT_COLOR[a.severity] || "#868E96";
                  return (
                    <div key={a.id} className="flex items-start gap-2.5 py-2">
                      <Icon size={14} strokeWidth={1.8} style={{ color }} className="mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#111315] truncate">{a.title}</p>
                        <p className="text-[11px] text-[#ADB5BD] truncate">
                          {a.driver_name ? `${a.driver_name} • ` : ""}{timeAgo(a.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
