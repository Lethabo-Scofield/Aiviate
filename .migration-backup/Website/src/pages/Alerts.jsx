import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  Clock,
  Eye,
  Gauge,
  Loader2,
  MapPinOff,
  Trash2,
  Wifi,
  Battery,
} from "lucide-react";
import { getAlerts, markAlertRead, markAllAlertsRead, deleteAlert } from "../services/api";

const TYPE_ICONS = {
  fatigue: Eye,
  route_deviation: MapPinOff,
  delay: Clock,
  harsh_braking: AlertTriangle,
  speeding: Gauge,
  device_offline: Wifi,
  battery_low: Battery,
};

const SEVERITY_STYLE = {
  critical: { bg: "bg-[#343A40]/10", text: "text-[#343A40]", label: "Critical" },
  warning: { bg: "bg-[#868E96]/10", text: "text-[#868E96]", label: "Warning" },
  info: { bg: "bg-[#0a84ff]/10", text: "text-[#0a84ff]", label: "Info" },
};

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

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unread | critical
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await getAlerts({ limit: 200 });
      setAlerts(data.alerts || []);
      setUnread(data.unread_count || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const filtered = alerts.filter((a) => {
    if (filter === "unread") return !a.is_read;
    if (filter === "critical") return a.severity === "critical";
    return true;
  });

  const handleMarkRead = async (id) => {
    await markAlertRead(id);
    load();
  };

  const handleDelete = async (id) => {
    await deleteAlert(id);
    setAlerts((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed && !removed.is_read) setUnread((u) => Math.max(0, u - 1));
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleMarkAll = async () => {
    setBusy(true);
    try {
      await markAllAlertsRead();
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Intelligence</h1>
        {unread > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={busy}
            className="apple-btn apple-btn-secondary text-[13px]"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Mark all read
          </button>
        )}
      </div>

      <p className="text-[13px] sm:text-[14px] text-[#868E96] mb-6 sm:mb-8">Anomalies, risks, and incidents your fleet's telemetry surfaced.</p>

      <div className="ios-seg mb-5">
        {[
          { key: "all", label: "All" },
          { key: "unread", label: `Unread${unread ? ` · ${unread}` : ""}` },
          { key: "critical", label: "Critical" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? "active" : ""}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="apple-card p-4">
              <div className="skeleton h-4 w-40 mb-2" />
              <div className="skeleton h-3 w-72" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <Bell size={22} className="text-[#ADB5BD] mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-semibold text-[#111315] mb-1">All clear</p>
          <p className="text-[13px] text-[#868E96]">No alerts to show.</p>
        </div>
      ) : (
        <div className="apple-card divide-y divide-black/[0.05]">
          {filtered.map((a) => {
            const Icon = TYPE_ICONS[a.type] || Bell;
            const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info;
            return (
              <div
                key={a.id}
                className={`p-4 flex items-start gap-3 group ${a.is_read ? "opacity-60" : ""}`}
              >
                <Icon size={16} className={`${sev.text} mt-0.5 shrink-0`} strokeWidth={1.8} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-[#111315] truncate">{a.title}</p>
                    {!a.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff] shrink-0" />}
                  </div>
                  <p className="text-[13px] text-[#5C636A] leading-relaxed mt-0.5">{a.message}</p>
                  <p className="text-[11px] text-[#ADB5BD] mt-1">
                    {a.driver_name && <>{a.driver_name} · </>}{timeAgo(a.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!a.is_read && (
                    <button
                      onClick={() => handleMarkRead(a.id)}
                      title="Mark as read"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.04] text-[#868E96]"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(a.id)}
                    title="Delete"
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#343A40]/10 text-[#868E96] hover:text-[#343A40]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
