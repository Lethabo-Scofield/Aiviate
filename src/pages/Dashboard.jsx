import { useState, useEffect } from "react";
import {
  Package,
  Truck,
  MapPin,
  ArrowRight,
  Upload,
  Shield,
  Clock,
  Activity,
  Bell,
  AlertTriangle,
  Eye,
  Gauge,
  MapPinOff,
  Wifi,
  Battery,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getStats, getJobs, getLiveOps, getAlerts, seedDemoData } from "../services/api";

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

function driverIcon(label, status) {
  const color = status === "on_route" ? "#34c759" : status === "blocked" ? "#ff3b30" : "#aeaeb2";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="position:relative"><div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:10px;">${label}</div>${status === "on_route" ? `<div style="position:absolute;top:-5px;left:-5px;width:38px;height:38px;border-radius:50%;background:${color};opacity:0.25;animation:pulseGlow 1.8s ease-in-out infinite;"></div>` : ""}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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

function ScoreRing({ score, size = 56 }) {
  const color = score >= 90 ? "#34c759" : score >= 75 ? "#30b0c7" : score >= 60 ? "#ff9500" : "#ff3b30";
  const radius = (size - 8) / 2;
  const c = 2 * Math.PI * radius;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#f0f0f0" strokeWidth={4} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={4} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-[14px] font-semibold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [live, setLive] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const navigate = useNavigate();

  const loadAll = async () => {
    const [s, j, l, a] = await Promise.all([
      getStats(),
      getJobs(),
      getLiveOps().catch(() => ({ drivers: [] })),
      getAlerts({ limit: 6 }).catch(() => ({ alerts: [] })),
    ]);
    setStats(s);
    setJobs(j.jobs || []);
    setLive(l);
    setAlerts(a.alerts || []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await loadAll();
      } catch (e) {
        console.error(e);
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };
    run();
    const id = setInterval(() => {
      getLiveOps().then(setLive).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoData();
      await loadAll();
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72 mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="stat-card">
              <div className="skeleton h-3 w-16 mb-2" />
              <div className="skeleton h-8 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-[24px] font-semibold mb-8 tracking-tight">Dashboard</h1>
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#ff3b30] mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  const hasData = stats && (stats.total_jobs || 0) > 0;
  const drivers = live?.drivers || [];
  const center = drivers.length
    ? [
        drivers.reduce((a, d) => a + d.lat, 0) / drivers.length,
        drivers.reduce((a, d) => a + d.lng, 0) / drivers.length,
      ]
    : [-26.2041, 28.0473];

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Dashboard</h1>
          <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">Overview of your dispatch operations</p>
        </div>
        {hasData && (
          <button onClick={handleSeed} disabled={seeding} className="apple-btn apple-btn-secondary text-[12px]">
            <Sparkles size={13} /> {seeding ? "Generating..." : "Generate demo data"}
          </button>
        )}
      </div>

      {!hasData ? (
        <div className="space-y-5">
          <div className="apple-card p-10 sm:p-14 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mx-auto mb-5">
              <Package size={28} className="text-[#86868b]" strokeWidth={1.5} />
            </div>
            <h2 className="text-[20px] font-semibold text-[#1d1d1f] mb-2 tracking-tight">Get started</h2>
            <p className="text-[14px] text-[#86868b] mb-8 max-w-sm mx-auto leading-relaxed">
              Upload a spreadsheet of delivery addresses and the system will optimize your routes automatically.
            </p>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <button onClick={() => navigate("/dispatch")} className="apple-btn apple-btn-primary">
                Upload Deliveries <ArrowRight size={16} />
              </button>
              <button onClick={handleSeed} disabled={seeding} className="apple-btn apple-btn-secondary">
                <Sparkles size={14} /> {seeding ? "Generating..." : "Generate demo data"}
              </button>
            </div>
          </div>

          <div className="apple-card p-6">
            <h3 className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider mb-5">Three steps to optimized routes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { step: "1", title: "Upload", desc: "Upload an Excel or CSV file with delivery addresses" },
                { step: "2", title: "Optimize", desc: "System geocodes, clusters and finds the best routes" },
                { step: "3", title: "Dispatch", desc: "Assign optimized jobs to your drivers" },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#008080] text-white flex items-center justify-center text-[12px] font-bold shrink-0">{step}</div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#1d1d1f] mb-1">{title}</p>
                    <p className="text-[12px] text-[#aeaeb2] leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-[#86868b] font-medium uppercase tracking-wide mb-2">Active drivers</p>
                  <p className="text-[28px] font-semibold text-[#1d1d1f] tracking-tight leading-none">{stats.active_drivers || 0}</p>
                  <p className="text-[11px] mt-2 text-[#aeaeb2]">of {stats.total_drivers || 0} total</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
                  <Truck size={16} className="text-[#86868b]" strokeWidth={1.8} />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-[#86868b] font-medium uppercase tracking-wide mb-2">Stops today</p>
                  <p className="text-[28px] font-semibold text-[#1d1d1f] tracking-tight leading-none">{stats.stops_today || 0}</p>
                  <p className="text-[11px] mt-2 text-[#aeaeb2]">{stats.total_stops || 0} all-time</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
                  <MapPin size={16} className="text-[#86868b]" strokeWidth={1.8} />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-[#86868b] font-medium uppercase tracking-wide mb-2">On-time rate</p>
                  <p className="text-[28px] font-semibold text-[#34c759] tracking-tight leading-none">{stats.on_time_rate || 0}%</p>
                  <p className="text-[11px] mt-2 text-[#aeaeb2]">Target 95%</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
                  <Clock size={16} className="text-[#86868b]" strokeWidth={1.8} />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#86868b] font-medium uppercase tracking-wide mb-2">Safety score</p>
                  <p className="text-[28px] font-semibold text-[#1d1d1f] tracking-tight leading-none">{stats.fleet_safety_score || 100}</p>
                  <p className="text-[11px] mt-2 text-[#aeaeb2]">Fleet average</p>
                </div>
                <ScoreRing score={stats.fleet_safety_score || 100} size={48} />
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-[#86868b] font-medium uppercase tracking-wide mb-2">Total distance</p>
                  <p className="text-[28px] font-semibold text-[#1d1d1f] tracking-tight leading-none">{stats.total_distance_km || 0}</p>
                  <p className="text-[11px] mt-2 text-[#aeaeb2]">km optimized</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
                  <Activity size={16} className="text-[#86868b]" strokeWidth={1.8} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 apple-card overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div>
                  <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Live fleet map</h2>
                  <p className="text-[11px] text-[#aeaeb2]">{drivers.length} drivers tracked</p>
                </div>
                <button onClick={() => navigate("/live-ops")} className="text-[12px] font-semibold text-[#0a84ff] hover:underline">
                  Open Live Ops →
                </button>
              </div>
              <div className="h-[360px]">
                <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                  />
                  {drivers.map((d, i) => (
                    <Marker key={d.driver_id} position={[d.lat, d.lng]} icon={driverIcon(String(i + 1), d.status)} />
                  ))}
                </MapContainer>
              </div>
            </div>

            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Recent alerts</h2>
                <button onClick={() => navigate("/alerts")} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f] font-medium">View all</button>
              </div>
              {alerts.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={22} className="text-[#aeaeb2] mx-auto mb-2" />
                  <p className="text-[13px] text-[#aeaeb2]">No alerts</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {alerts.map((a) => {
                    const Icon = ALERT_ICONS[a.type] || Bell;
                    const color = ALERT_COLOR[a.severity] || "#86868b";
                    return (
                      <div key={a.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[#f5f5f7]">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1A`, color }}>
                          <Icon size={13} strokeWidth={1.8} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#1d1d1f] truncate">{a.title}</p>
                          <p className="text-[11px] text-[#86868b] truncate">
                            {a.driver_name ? `${a.driver_name} • ` : ""}{timeAgo(a.created_at)}
                          </p>
                        </div>
                        {!a.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff] mt-2" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Johannesburg areas</h2>
                <Shield size={15} className="text-[#86868b]" />
              </div>
              {(!stats.areas || stats.areas.length === 0) ? (
                <p className="text-[13px] text-[#aeaeb2] py-6 text-center">No area data yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.areas.map((a) => {
                    const maxStops = Math.max(...stats.areas.map((x) => x.stops));
                    const pct = maxStops > 0 ? (a.stops / maxStops) * 100 : 0;
                    return (
                      <div key={a.area}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="font-medium text-[#1d1d1f] truncate pr-2">{a.area}</span>
                          <span className="text-[#86868b]">{a.stops} stops • {a.distance_km} km</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
                          <div className="h-full bg-[#008080]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Recent jobs</h2>
                <button onClick={() => navigate("/jobs")} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f] font-medium">View all</button>
              </div>
              <div className="space-y-1">
                {jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f5f5f7]">
                    <div>
                      <p className="text-[13px] font-medium text-[#1d1d1f]">{job.area}</p>
                      <p className="text-[11px] text-[#aeaeb2]">{job.total_stops} stops • {job.total_distance_km} km</p>
                    </div>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${
                      job.status === "assigned" ? "bg-[#008080]/10 text-[#008080]" :
                      job.status === "completed" ? "bg-[#34c759]/10 text-[#34c759]" :
                      "bg-[#ff9500]/10 text-[#ff9500]"
                    }`}>{job.status}</span>
                  </div>
                ))}
                {jobs.length === 0 && <p className="text-[13px] text-[#aeaeb2] py-6 text-center">No jobs yet</p>}
              </div>
            </div>

            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Devices</h2>
                <button onClick={() => navigate("/devices")} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f] font-medium">Manage</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#f5f5f7] rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold">Total</p>
                  <p className="text-[24px] font-semibold text-[#1d1d1f]">{stats.total_devices || 0}</p>
                </div>
                <div className="bg-[#34c759]/10 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#34c759] font-semibold">Online</p>
                  <p className="text-[24px] font-semibold text-[#34c759]">{stats.online_devices || 0}</p>
                </div>
                <div className="bg-[#ff9500]/10 rounded-xl p-3 col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#ff9500] font-semibold">Unread alerts</p>
                  <p className="text-[24px] font-semibold text-[#ff9500]">{stats.unread_alerts || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <button onClick={() => navigate("/dispatch")} className="apple-btn apple-btn-secondary text-[13px]">
            <Upload size={14} /> Upload new deliveries
          </button>
        </div>
      )}
    </div>
  );
}
