import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Eye,
  AlertTriangle,
  Gauge,
  Smartphone,
  CornerUpRight,
  Shield,
  TrendingDown,
  Camera,
} from "lucide-react";
import { getSafetyOverview, getSafetyEvents } from "../services/api";

const EVENT_META = {
  fatigue: { label: "Drowsiness", icon: Eye, color: "#ff3b30" },
  harsh_brake: { label: "Harsh brake", icon: AlertTriangle, color: "#ff9500" },
  speeding: { label: "Speeding", icon: Gauge, color: "#ff9500" },
  phone_use: { label: "Phone use", icon: Smartphone, color: "#868E96" },
  sharp_turn: { label: "Sharp turn", icon: CornerUpRight, color: "#868E96" },
};

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function alertnessFromDriver(d) {
  // Drowsiness-weighted alertness: penalise fatigue events the hardest.
  const fatiguePenalty = (d.fatigue || 0) * 9;
  const otherPenalty = ((d.total_events || 0) - (d.fatigue || 0)) * 2;
  return Math.max(0, Math.min(100, 100 - fatiguePenalty - otherPenalty));
}

function tier(score) {
  if (score >= 85) return { label: "Alert", color: "#34c759" };
  if (score >= 65) return { label: "Watch", color: "#ff9500" };
  return { label: "At risk", color: "#ff3b30" };
}

export default function SafetyCenter({ embedded = false }) {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [o, e] = await Promise.all([getSafetyOverview(), getSafetyEvents()]);
        setOverview(o);
        setEvents(e.events || []);
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  const drivers = overview?.drivers || [];
  const fatigueEvents = useMemo(() => events.filter((e) => e.event_type === "fatigue"), [events]);
  const fatigueToday = useMemo(() => fatigueEvents.filter((e) => isToday(e.created_at)), [fatigueEvents]);
  const severeNow = useMemo(
    () => fatigueEvents.filter((e) => e.severity >= 4 && Date.now() - new Date(e.created_at).getTime() < 60 * 60 * 1000),
    [fatigueEvents]
  );

  const driversByAlertness = useMemo(() => {
    return [...drivers]
      .map((d) => ({ ...d, alertness: alertnessFromDriver(d) }))
      .sort((a, b) => a.alertness - b.alertness);
  }, [drivers]);

  const atRiskNow = driversByAlertness.filter((d) => d.alertness < 65);
  const fatigueHeatmap = useMemo(
    () =>
      fatigueEvents
        .filter((e) => e.lat != null && e.lng != null)
        .map((e) => ({ lat: e.lat, lng: e.lng, severity: e.severity })),
    [fatigueEvents]
  );

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="apple-card p-6">
              <div className="skeleton h-4 w-20 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!embedded && (
        <div className="mb-6 sm:mb-8">
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Safety</h1>
          <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
            Live fatigue picture across your fleet — driven by your Guardian cameras.
          </p>
        </div>
      )}

      {/* Critical band — drowsy now */}
      {severeNow.length > 0 ? (
        <div
          className="rounded-2xl p-5 mb-5 flex items-start gap-4"
          style={{ background: "linear-gradient(135deg, #ff3b30 0%, #ff6b3d 100%)", color: "white" }}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Critical · drowsiness detected</p>
            <p className="text-[18px] font-semibold mt-0.5">
              {severeNow.length} driver{severeNow.length > 1 ? "s" : ""} showing severe signs of fatigue right now
            </p>
            <p className="text-[12px] opacity-90 mt-1">
              {severeNow.slice(0, 3).map((e) => e.driver_name).join(" · ")}
              {severeNow.length > 3 ? ` +${severeNow.length - 3} more` : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-4 mb-5 flex items-center gap-3 bg-[#34c759]/[0.08] border border-[#34c759]/20">
          <div className="w-9 h-9 rounded-xl bg-[#34c759]/15 flex items-center justify-center">
            <Shield size={16} className="text-[#34c759]" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#111315]">All clear right now</p>
            <p className="text-[12px] text-[#868E96]">No severe drowsiness in the last hour</p>
          </div>
        </div>
      )}

      {/* Headline stats — fatigue-first */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="stat-card">
          <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wide mb-2">Drowsy now</p>
          <p className="text-[28px] font-semibold tracking-tight leading-none" style={{ color: severeNow.length > 0 ? "#ff3b30" : "#34c759" }}>
            {severeNow.length}
          </p>
          <p className="text-[11px] text-[#ADB5BD] mt-2">drivers in last hour</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wide mb-2">Caught today</p>
          <p className="text-[28px] font-semibold tracking-tight leading-none text-[#111315]">{fatigueToday.length}</p>
          <p className="text-[11px] text-[#ADB5BD] mt-2">drowsiness events</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wide mb-2">Cameras watching</p>
          <p className="text-[28px] font-semibold tracking-tight leading-none text-[#008080]">{drivers.length}</p>
          <p className="text-[11px] text-[#ADB5BD] mt-2">drivers protected</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wide mb-2">At-risk drivers</p>
          <p className="text-[28px] font-semibold tracking-tight leading-none" style={{ color: atRiskNow.length > 0 ? "#ff9500" : "#34c759" }}>
            {atRiskNow.length}
          </p>
          <p className="text-[11px] text-[#ADB5BD] mt-2">risk score below 65</p>
        </div>
      </div>

      {/* Driver alertness list + fatigue map */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
        <div className="apple-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111315]">Driver risk</h2>
              <p className="text-[11px] text-[#ADB5BD] mt-0.5">Weighted by recent drowsiness events</p>
            </div>
            <Eye size={16} className="text-[#868E96]" />
          </div>
          {driversByAlertness.length === 0 ? (
            <p className="text-[13px] text-[#ADB5BD] py-8 text-center">No drivers yet</p>
          ) : (
            <div className="space-y-1.5">
              {driversByAlertness.map((d) => {
                const t = tier(d.alertness);
                return (
                  <div key={d.driver_id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F1F3F5] transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${t.color}1A`, color: t.color }}>
                      <Eye size={14} strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#111315] truncate">{d.driver_name}</p>
                      <p className="text-[11px] text-[#ADB5BD]">
                        {d.fatigue || 0} drowsy · {d.total_events || 0} total events
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-[#F1F3F5] overflow-hidden">
                        <div className="h-full" style={{ width: `${d.alertness}%`, background: t.color }} />
                      </div>
                      <span className="text-[13px] font-semibold w-8 text-right" style={{ color: t.color }}>
                        {d.alertness}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider w-12 text-right" style={{ color: t.color }}>
                        {t.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="apple-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111315]">Where they nod off</h2>
              <p className="text-[11px] text-[#ADB5BD] mt-0.5">Drowsiness hotspots</p>
            </div>
            <span className="text-[11px] text-[#ADB5BD]">{fatigueHeatmap.length} events</span>
          </div>
          <div className="rounded-xl overflow-hidden h-[280px]">
            <MapContainer center={[-26.2041, 28.0473]} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              {fatigueHeatmap.map((p, i) => (
                <CircleMarker
                  key={i}
                  center={[p.lat, p.lng]}
                  radius={6 + p.severity * 2}
                  pathOptions={{
                    color: "#ff3b30",
                    fillColor: "#ff3b30",
                    fillOpacity: 0.3 + Math.min(0.5, p.severity * 0.1),
                    weight: 1,
                  }}
                >
                  <Tooltip>Severity {p.severity}</Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Recent drowsiness events */}
      <div className="apple-card p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-semibold text-[#111315]">Recent drowsiness catches</h2>
          <Camera size={14} className="text-[#868E96]" />
        </div>
        {fatigueEvents.length === 0 ? (
          <p className="text-[13px] text-[#ADB5BD] py-6 text-center">No drowsiness detected yet — your drivers are wide awake.</p>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
            {fatigueEvents.slice(0, 25).map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F1F3F5]">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#ff3b30]/10 text-[#ff3b30]">
                  <Eye size={14} strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#111315]">
                    {e.driver_name}
                    <span className="text-[#868E96] font-normal"> — eye closure / yawn detected</span>
                  </p>
                  <p className="text-[11px] text-[#ADB5BD]">severity {e.severity}/5 · {timeAgo(e.created_at)}</p>
                </div>
                {e.severity >= 4 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ff3b30] text-white font-semibold">CRITICAL</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* De-emphasized: other safety signals */}
      <div className="apple-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[#111315]">Other safety signals</h2>
            <p className="text-[11px] text-[#ADB5BD] mt-0.5">Secondary telemetry — fatigue is what we hunt</p>
          </div>
          <TrendingDown size={14} className="text-[#ADB5BD]" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(EVENT_META)
            .filter(([key]) => key !== "fatigue")
            .map(([key, meta]) => {
              const Icon = meta.icon;
              const count = overview?.event_type_counts?.[key] || 0;
              return (
                <div key={key} className="rounded-xl bg-[#F1F3F5] p-3 flex items-center gap-3">
                  <Icon size={14} className="text-[#868E96]" />
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold text-[#111315] leading-none">{count}</p>
                    <p className="text-[10px] text-[#868E96] mt-1">{meta.label}</p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
