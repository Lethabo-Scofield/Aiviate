import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  Eye,
  Radio,
  X,
  ChevronRight,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  getDrivers,
  getDevices,
  getSafetyEvents,
  getAlerts,
  getLiveOps,
} from "../services/api";

const CATEGORY = {
  rotate: { label: "Driver risk", color: "#ff3b30", icon: Eye },
  device: { label: "Telemetry", color: "#0a84ff", icon: Camera },
  critical: { label: "Critical", color: "#ff3b30", icon: AlertTriangle },
  blocked: { label: "Dispatch", color: "#ff9500", icon: Radio },
  delay: { label: "Delay", color: "#ff9500", icon: Clock },
};

function within(iso, hours) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < hours * 3600 * 1000;
}

function minutesSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function buildRecommendations({ drivers, devices, events, alerts, liveops }) {
  const recs = [];

  // 1. Driver fatigue rotation — drivers with 2+ fatigue events in last 4h
  const fatigueByDriver = {};
  events
    .filter((e) => e.event_type === "fatigue" && within(e.created_at, 4))
    .forEach((e) => {
      fatigueByDriver[e.driver_id] = (fatigueByDriver[e.driver_id] || 0) + 1;
    });
  Object.entries(fatigueByDriver).forEach(([driverId, count]) => {
    if (count >= 2) {
      const d = drivers.find((x) => x.id === driverId);
      if (!d) return;
      const confidence = Math.min(98, 70 + count * 6);
      recs.push({
        id: `rotate-${driverId}`,
        kind: "rotate",
        title: `Pull ${d.name} from the road`,
        why: `${count} drowsiness events in the last 4 hours — risk of incident is climbing`,
        action: "Rotate driver and reassign their remaining stops",
        confidence,
        link: `/drivers`,
      });
    }
  });

  // 2. Offline Guardians > 10 minutes
  devices
    .filter((d) => d.status === "offline" && minutesSince(d.last_seen) >= 10)
    .forEach((d) => {
      recs.push({
        id: `device-${d.id}`,
        kind: "device",
        title: `${d.name} hasn't reported in ${minutesSince(d.last_seen)}m`,
        why: d.driver_id
          ? `This driver is currently unmonitored — fatigue inference is offline`
          : `Unit appears disconnected — battery, network, or pulled from cab`,
        action: d.driver_id ? "Call driver and confirm device power/connection" : "Mark for retrieval",
        confidence: 92,
        link: `/devices`,
      });
    });

  // 3. Open critical alerts
  alerts
    .filter((a) => a.severity === "critical" && !a.is_read)
    .slice(0, 4)
    .forEach((a) => {
      recs.push({
        id: `alert-${a.id}`,
        kind: "critical",
        title: a.title || "Critical alert open",
        why: a.message || "Severity flagged as critical and not acknowledged",
        action: "Acknowledge and dispatch response",
        confidence: 99,
        link: `/intelligence`,
      });
    });

  // 4. Blocked drivers still in live-ops
  liveops
    .filter((d) => d.blocked || d.status === "blocked")
    .forEach((d) => {
      recs.push({
        id: `blocked-${d.driver_id}`,
        kind: "blocked",
        title: `${d.driver_name} is blocked but on a route`,
        why: `Driver is in a blocked state — assigned stops may go undelivered`,
        action: "Unassign or unblock to keep deliveries flowing",
        confidence: 88,
        link: `/dispatch`,
      });
    });

  // Sort by category severity then confidence
  const weight = { critical: 4, rotate: 3, blocked: 2, device: 1, delay: 0 };
  recs.sort((a, b) => (weight[b.kind] - weight[a.kind]) || (b.confidence - a.confidence));
  return recs;
}

function RecommendationCard({ rec, onAccept, onDismiss, onOpen }) {
  const meta = CATEGORY[rec.kind] || CATEGORY.delay;
  const Icon = meta.icon;
  return (
    <div className="apple-card p-4 sm:p-5 flex items-start gap-3 sm:gap-4">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${meta.color}1A`, color: meta.color }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}14`, color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="text-[10px] text-[#aeaeb2] flex items-center gap-1">
            <Sparkles size={10} /> {rec.confidence}% confidence
          </span>
        </div>
        <p className="text-[14px] font-semibold text-[#1d1d1f] leading-snug">{rec.title}</p>
        <p className="text-[12px] text-[#86868b] mt-1 leading-snug">{rec.why}</p>
        <p className="text-[12px] text-[#1d1d1f] mt-2 flex items-start gap-1.5">
          <Zap size={12} className="text-[#008080] mt-0.5 shrink-0" />
          <span><span className="text-[#86868b]">Recommended: </span>{rec.action}</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => onAccept(rec.id)} className="apple-btn apple-btn-primary text-[12px] py-1.5 px-3">
            <CheckCircle2 size={12} /> Acknowledge
          </button>
          <button onClick={() => onOpen(rec.link)} className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3">
            Open <ChevronRight size={12} />
          </button>
          <button onClick={() => onDismiss(rec.id)} className="text-[12px] text-[#aeaeb2] hover:text-[#86868b] ml-auto px-2 py-1">
            <X size={12} className="inline" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const [data, setData] = useState({ drivers: [], devices: [], events: [], alerts: [], liveops: [] });
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("dismissedRecs") || "[]")); }
    catch { return new Set(); }
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [drivers, devices, eventsResp, alertsResp, liveops] = await Promise.all([
          getDrivers(),
          getDevices(),
          getSafetyEvents(),
          getAlerts({ limit: 50 }),
          getLiveOps(),
        ]);
        const arr = (x, key) =>
          Array.isArray(x) ? x : Array.isArray(x?.[key]) ? x[key] : [];
        setData({
          drivers: arr(drivers, "drivers"),
          devices: arr(devices, "devices"),
          events: arr(eventsResp, "events"),
          alerts: arr(alertsResp, "alerts"),
          liveops: arr(liveops, "drivers"),
        });
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  const allRecs = useMemo(() => buildRecommendations(data), [data]);
  const recs = allRecs.filter((r) => !dismissed.has(r.id));

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem("dismissedRecs", JSON.stringify([...next]));
  };
  const accept = (id) => dismiss(id);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="skeleton h-8 w-56 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="apple-card p-6"><div className="skeleton h-4 w-2/3 mb-2" /><div className="skeleton h-3 w-full" /></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 sm:mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Brain size={22} className="text-[#008080]" /> Command Center
          </h1>
          <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">
            What needs your decision, right now. Pulled live from telemetry and safety events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#aeaeb2] uppercase tracking-wider font-semibold">Decisions waiting</span>
          <span
            className="text-[18px] font-semibold px-3 py-1 rounded-full"
            style={{ background: recs.length > 0 ? "#ff3b30" : "#34c759", color: "white" }}
          >
            {recs.length}
          </span>
        </div>
      </div>

      {/* Decisions waiting */}
      {recs.length === 0 ? (
        allRecs.length === 0 ? (
          <div className="apple-card p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#34c759]/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-[#34c759]" />
            </div>
            <p className="text-[16px] font-semibold text-[#1d1d1f]">No risks detected</p>
            <p className="text-[13px] text-[#86868b] mt-1">Telemetry looks clean — no drowsy drivers, no offline devices, no open critical alerts, no blocked routes.</p>
          </div>
        ) : (
          <div className="apple-card p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#aeaeb2]/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-[#86868b]" />
            </div>
            <p className="text-[16px] font-semibold text-[#1d1d1f]">All {allRecs.length} acknowledged this session</p>
            <p className="text-[13px] text-[#86868b] mt-1">Underlying risks may still be active — acknowledging only hides the card.</p>
            <button
              onClick={() => { setDismissed(new Set()); sessionStorage.removeItem("dismissedRecs"); }}
              className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3 mt-4"
            >
              Show dismissed
            </button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {recs.map((r) => (
            <RecommendationCard
              key={r.id}
              rec={r}
              onAccept={accept}
              onDismiss={dismiss}
              onOpen={(link) => navigate(link)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
