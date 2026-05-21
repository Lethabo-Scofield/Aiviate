import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Shield,
  AlertTriangle,
  Eye,
  Gauge,
  Smartphone,
  CornerUpRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { getSafetyOverview, getSafetyEvents } from "../services/api";

const EVENT_META = {
  harsh_brake: { label: "Harsh braking", icon: AlertTriangle, color: "#ff9500" },
  speeding: { label: "Speeding", icon: Gauge, color: "#ff3b30" },
  fatigue: { label: "Fatigue", icon: Eye, color: "#bf5af2" },
  phone_use: { label: "Phone use", icon: Smartphone, color: "#0a84ff" },
  sharp_turn: { label: "Sharp turn", icon: CornerUpRight, color: "#5e5ce6" },
};

function scoreColor(score) {
  if (score >= 90) return { text: "text-[#34c759]", ring: "#34c759", label: "Excellent" };
  if (score >= 75) return { text: "text-[#30b0c7]", ring: "#30b0c7", label: "Good" };
  if (score >= 60) return { text: "text-[#ff9500]", ring: "#ff9500", label: "Fair" };
  return { text: "text-[#ff3b30]", ring: "#ff3b30", label: "At risk" };
}

function ScoreRing({ score, size = 96 }) {
  const c = scoreColor(score);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#f0f0f0" strokeWidth={6} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={c.ring}
          strokeWidth={6}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[22px] font-semibold ${c.text} tracking-tight`}>{score}</span>
        <span className="text-[10px] text-[#86868b] font-medium uppercase tracking-wider">{c.label}</span>
      </div>
    </div>
  );
}

export default function SafetyCenter() {
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
  }, []);

  const fleetScore = overview?.fleet_safety_score ?? 100;
  const fleetColor = scoreColor(fleetScore);
  const eventCounts = overview?.event_type_counts || {};
  const heatmap = overview?.heatmap || [];

  const sortedDrivers = useMemo(() => overview?.drivers || [], [overview]);
  const topDriver = sortedDrivers[0];
  const bottomDriver = sortedDrivers[sortedDrivers.length - 1];

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
      <div className="mb-6 sm:mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Safety Center</h1>
        <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">
          Driver safety scores, behaviour trends and risk hotspots across Johannesburg
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="apple-card p-6 flex items-center gap-5">
          <ScoreRing score={fleetScore} size={104} />
          <div>
            <p className="text-[12px] text-[#86868b] uppercase tracking-wide font-semibold mb-1">Fleet safety score</p>
            <p className={`text-[14px] font-semibold ${fleetColor.text}`}>{fleetColor.label}</p>
            <p className="text-[12px] text-[#aeaeb2] mt-1">{overview?.total_events || 0} events tracked</p>
          </div>
        </div>

        <div className="apple-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-[#86868b] uppercase tracking-wide font-semibold">Top performer</p>
            <TrendingUp size={16} className="text-[#34c759]" />
          </div>
          {topDriver ? (
            <>
              <p className="text-[18px] font-semibold text-[#1d1d1f] truncate">{topDriver.driver_name}</p>
              <p className="text-[12px] text-[#86868b] mt-1">{topDriver.total_events} events</p>
              <div className="mt-3 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
                <div className="h-full bg-[#34c759]" style={{ width: `${topDriver.safety_score}%` }} />
              </div>
              <p className={`text-[13px] font-semibold mt-2 ${scoreColor(topDriver.safety_score).text}`}>
                Score: {topDriver.safety_score}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[#aeaeb2]">No drivers yet</p>
          )}
        </div>

        <div className="apple-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-[#86868b] uppercase tracking-wide font-semibold">Needs coaching</p>
            <TrendingDown size={16} className="text-[#ff3b30]" />
          </div>
          {bottomDriver && bottomDriver.driver_id !== topDriver?.driver_id ? (
            <>
              <p className="text-[18px] font-semibold text-[#1d1d1f] truncate">{bottomDriver.driver_name}</p>
              <p className="text-[12px] text-[#86868b] mt-1">{bottomDriver.total_events} events</p>
              <div className="mt-3 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
                <div className="h-full bg-[#ff9500]" style={{ width: `${bottomDriver.safety_score}%` }} />
              </div>
              <p className={`text-[13px] font-semibold mt-2 ${scoreColor(bottomDriver.safety_score).text}`}>
                Score: {bottomDriver.safety_score}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[#aeaeb2]">Not enough data</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {Object.entries(EVENT_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const count = eventCounts[key] || 0;
          return (
            <div key={key} className="apple-card p-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${meta.color}1A`, color: meta.color }}
              >
                <Icon size={16} strokeWidth={1.8} />
              </div>
              <p className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight leading-none">{count}</p>
              <p className="text-[11px] text-[#86868b] font-medium mt-1.5">{meta.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="apple-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Driver leaderboard</h2>
            <Shield size={16} className="text-[#86868b]" />
          </div>
          {sortedDrivers.length === 0 ? (
            <p className="text-[13px] text-[#aeaeb2] py-8 text-center">No drivers yet</p>
          ) : (
            <div className="space-y-2">
              {sortedDrivers.map((d, idx) => {
                const c = scoreColor(d.safety_score);
                return (
                  <div
                    key={d.driver_id}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f5f5f7] transition-colors"
                  >
                    <span className="w-6 text-[12px] font-semibold text-[#aeaeb2] text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{d.driver_name}</p>
                      <p className="text-[11px] text-[#aeaeb2]">
                        {d.total_events} events • {d.harsh_brake} brake • {d.speeding} speed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
                        <div className="h-full" style={{ width: `${d.safety_score}%`, background: c.ring }} />
                      </div>
                      <span className={`text-[13px] font-semibold ${c.text} w-8 text-right`}>{d.safety_score}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="apple-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Risk heatmap (Johannesburg)</h2>
            <span className="text-[11px] text-[#aeaeb2]">{heatmap.length} hotspots</span>
          </div>
          <div className="rounded-xl overflow-hidden h-[320px]">
            <MapContainer
              center={[-26.2041, 28.0473]}
              zoom={10}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />
              {heatmap.map((p, i) => (
                <CircleMarker
                  key={i}
                  center={[p.lat, p.lng]}
                  radius={6 + p.weight * 2}
                  pathOptions={{
                    color: "#ff3b30",
                    fillColor: "#ff3b30",
                    fillOpacity: 0.25 + Math.min(0.4, p.weight * 0.08),
                    weight: 1,
                  }}
                >
                  <Tooltip>Severity {p.weight}</Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      <div className="apple-card p-5">
        <h2 className="text-[14px] font-semibold text-[#1d1d1f] mb-4">Recent safety events</h2>
        {events.length === 0 ? (
          <p className="text-[13px] text-[#aeaeb2] py-6 text-center">No events recorded</p>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
            {events.slice(0, 30).map((e) => {
              const meta = EVENT_META[e.event_type] || EVENT_META.harsh_brake;
              const Icon = meta.icon;
              return (
                <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f5f5f7]">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${meta.color}1A`, color: meta.color }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1d1d1f]">{meta.label}</p>
                    <p className="text-[11px] text-[#86868b]">
                      {e.driver_name} • severity {e.severity}/5
                    </p>
                  </div>
                  <span className="text-[11px] text-[#aeaeb2]">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
