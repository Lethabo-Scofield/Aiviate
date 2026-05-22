import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Battery,
  Bell,
  Brain,
  CheckCircle2,
  Clock,
  Eye,
  History,
  MapPin,
  Radio,
  RefreshCcw,
  Sparkles,
  Truck,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import {
  acknowledgeRecommendation,
  assignDriver,
  getAlerts,
  getAuditLog,
  getDevices,
  getDrivers,
  getJobs,
  getRecommendations,
  getSafetyEvents,
  markAlertRead,
  sendCommand,
  toggleBlockDriver,
  unassignDriver,
} from "../services/api";

/* ─────────────────────────── helpers ─────────────────────────── */
function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SEV = {
  critical: "#ff3b30", high: "#ff3b30", medium: "#ff9500", low: "#34c759",
  warning: "#ff9500", info: "#0a84ff",
};

function fmtCoord(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

/* ─────────────────────────── small UI bits ─────────────────────────── */
function SectionHeader({ icon: Icon, title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3 mt-8 first:mt-0">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] flex items-center gap-2">
          {Icon && <Icon size={15} className="text-[#008080]" />} {title}
        </h2>
        {subtitle && <p className="text-[11px] text-[#86868b] mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const bg = toast.kind === "error" ? "#ff3b30" : "#1d1d1f";
  return (
    <div role="status" aria-live="polite"
         className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3"
         style={{ background: bg, color: "white" }}>
      <span className="text-[13px]">{toast.message}</span>
      <button onClick={onClose} aria-label="Dismiss notification"
              className="opacity-70 hover:opacity-100"><X size={13} /></button>
    </div>
  );
}

function RecommendationCard({ rec, onAck, onDismiss }) {
  const color = SEV[rec.severity] || SEV.medium;
  return (
    <div className="apple-card p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: `${color}1A`, color }}>
        <AlertTriangle size={14} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${color}14`, color }}>{rec.severity}</span>
          <span className="text-[10px] text-[#aeaeb2]">{rec.category}</span>
          <span className="text-[10px] text-[#aeaeb2] flex items-center gap-1">
            <Sparkles size={9} /> {Math.round((rec.confidence || 0) * 100)}%
          </span>
        </div>
        <p className="text-[13px] font-semibold text-[#1d1d1f]">{rec.what}</p>
        {rec.why && <p className="text-[12px] text-[#86868b] mt-0.5">{rec.why}</p>}
        <p className="text-[12px] text-[#1d1d1f] mt-1.5 flex items-start gap-1.5">
          <Zap size={11} className="text-[#008080] mt-0.5 shrink-0" />
          <span><span className="text-[#86868b]">Recommended: </span>{rec.action}</span>
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button onClick={() => onAck(rec)}
                  className="apple-btn apple-btn-primary text-[11px] py-1 px-2.5">
            <CheckCircle2 size={11} /> Acknowledge
          </button>
          <button onClick={() => onDismiss(rec.id)}
                  className="text-[11px] text-[#aeaeb2] hover:text-[#86868b] ml-auto px-2 py-1">
            <X size={11} className="inline" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── main ─────────────────────────── */
export default function Operations() {
  const [data, setData] = useState({
    recs: [], audit: [], drivers: [], jobs: [], alerts: [], devices: [], safety: [],
  });
  const [partialFailures, setPartialFailures] = useState([]); // list of section names that failed
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("dismissedRecs") || "[]")); }
    catch { return new Set(); }
  });
  const reqIdRef = useRef(0);

  const notify = (message, kind = "info") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    try {
      const settled = await Promise.allSettled([
        getRecommendations(),
        getAuditLog(20),
        getDrivers(),
        getJobs(),
        getAlerts({ unread: true, limit: 20 }),
        getDevices(),
        getSafetyEvents(),
      ]);
      if (myReq !== reqIdRef.current) return; // stale response, drop
      const labels = ["recs", "audit", "drivers", "jobs", "alerts", "devices", "safety"];
      const failed = [];
      const get = (i, key, fallback) => {
        if (settled[i].status === "fulfilled") return settled[i].value?.[key] ?? fallback;
        failed.push(labels[i]);
        return fallback;
      };
      setData({
        recs: get(0, "recommendations", []),
        audit: get(1, "entries", []),
        drivers: get(2, "drivers", []),
        jobs: get(3, "jobs", []),
        alerts: get(4, "alerts", []),
        devices: get(5, "devices", []),
        safety: get(6, "events", []),
      });
      setPartialFailures(failed);
      setLoadError(null);
      setLastSyncAt(new Date().toISOString());
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setLoadError(e?.message || "Could not reach the backend");
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const visibleRecs = useMemo(
    () => data.recs.filter((r) => !dismissed.has(r.id)),
    [data.recs, dismissed]
  );
  const autoActions = useMemo(
    () => data.audit.filter((e) => e.actor === "workflow_engine").slice(0, 3),
    [data.audit]
  );

  const setBusyFor = (key, v) => setBusy((b) => ({ ...b, [key]: v }));

  /* ────── inline action handlers ────── */
  const dismiss = (id) => {
    const next = new Set(dismissed); next.add(id);
    setDismissed(next);
    sessionStorage.setItem("dismissedRecs", JSON.stringify([...next]));
  };

  const onAck = async (rec) => {
    dismiss(rec.id);
    try {
      await acknowledgeRecommendation(rec.id, { summary: `Acknowledged: ${rec.what}` });
      notify("Acknowledged · logged in audit trail");
      await load();
    } catch (e) {
      notify(`Acknowledge failed: ${e?.message || "unknown error"}`, "error");
    }
  };

  const onToggleBlock = async (driver) => {
    setBusyFor(`drv:${driver.id}`, true);
    try { await toggleBlockDriver(driver.id); notify(`${driver.name}: ${driver.blocked ? "unblocked" : "blocked"}`); await load(); }
    catch (e) { notify(e?.message || "Failed", "error"); }
    finally { setBusyFor(`drv:${driver.id}`, false); }
  };

  const onAssign = async (jobId, driverId) => {
    if (!driverId) return;
    setBusyFor(`job:${jobId}`, true);
    try { await assignDriver(jobId, driverId); notify("Assigned · route auto-optimized"); await load(); }
    catch (e) { notify(e?.message || "Failed", "error"); }
    finally { setBusyFor(`job:${jobId}`, false); }
  };

  const onUnassign = async (jobId) => {
    setBusyFor(`job:${jobId}`, true);
    try { await unassignDriver(jobId); notify("Unassigned"); await load(); }
    catch (e) { notify(e?.message || "Failed", "error"); }
    finally { setBusyFor(`job:${jobId}`, false); }
  };

  const onOptimize = async (jobId) => {
    setBusyFor(`job:${jobId}`, true);
    try {
      const r = await sendCommand(`optimize ${jobId}`);
      notify(r?.summary || "Optimized");
      await load();
    } catch (e) { notify(e?.message || "Failed", "error"); }
    finally { setBusyFor(`job:${jobId}`, false); }
  };

  const onMarkAlertRead = async (alertId) => {
    try { await markAlertRead(alertId); await load(); }
    catch (e) { notify(e?.message || "Failed", "error"); }
  };

  /* ────── loading gate ────── */
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="apple-card p-5">
            <div className="skeleton h-4 w-2/3 mb-2" />
            <div className="skeleton h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  /* ────── derived buckets (using correct backend shapes) ────── */
  const unassignedJobs = data.jobs.filter((j) => j.status === "unassigned");
  const activeJobs = data.jobs.filter((j) => j.status === "assigned" || j.status === "in_progress");
  const availableDrivers = data.drivers.filter((d) => !d.blocked);
  const lowBatteryDevices = data.devices.filter(
    (d) => typeof d.battery_pct === "number" && d.battery_pct < 20 && d.status !== "offline"
  );
  const offlineDevices = data.devices.filter((d) => d.status === "offline");
  const recentSafety = data.safety.slice(0, 4);
  const partial = partialFailures.length > 0;

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Brain size={24} className="text-[#008080]" /> Operations
          </h1>
          <p className="text-[13px] text-[#86868b] mt-1">
            One surface. Decisions, automated actions, fleet state — all inline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-[#aeaeb2] font-semibold">Decisions waiting</p>
            <p className="text-[22px] font-semibold leading-none mt-0.5"
               style={{ color: visibleRecs.length > 0 ? "#ff3b30" : "#34c759" }}>
              {visibleRecs.length}
            </p>
          </div>
          <button onClick={load} title="Refresh now" aria-label="Refresh data"
                  className="w-9 h-9 rounded-xl bg-[#f5f5f7] hover:bg-[#ebebed] flex items-center justify-center">
            <RefreshCcw size={14} className="text-[#1d1d1f]" />
          </button>
        </div>
      </div>

      {/* Service-down banner — total failure */}
      {loadError && !lastSyncAt && (
        <div className="apple-card p-5 mb-5 border-2 border-[#ff3b30]/20 text-center">
          <AlertTriangle size={20} className="text-[#ff3b30] mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-[#1d1d1f]">Can't reach the backend</p>
          <p className="text-[12px] text-[#86868b] mt-1">Treat this as unknown, not safe. ({loadError})</p>
        </div>
      )}

      {/* Partial-degradation banner — some sections failed */}
      {partial && (
        <div className="apple-card p-3 mb-4 border border-[#ff9500]/30 bg-[#ff9500]/[0.04] flex items-start gap-2">
          <AlertTriangle size={14} className="text-[#ff9500] mt-0.5 shrink-0" />
          <p className="text-[12px] text-[#1d1d1f]">
            <span className="font-semibold">Partial outage:</span> couldn't fetch{" "}
            <span className="font-mono text-[#86868b]">{partialFailures.join(", ")}</span>. Treat those sections as stale.
          </p>
        </div>
      )}

      {/* Auto-pilot status */}
      <div className="apple-card p-4 mb-5 border border-[#008080]/15 bg-gradient-to-br from-[#008080]/[0.04] to-transparent">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Brain size={14} className="text-[#008080]" />
          <p className="text-[13px] font-semibold text-[#1d1d1f]">Aiviate Auto-pilot</p>
          {partial || loadError ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[#ff9500]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff9500]" /> Degraded
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[#34c759]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" /> Live
            </span>
          )}
          <span className="text-[11px] text-[#86868b] ml-auto">
            {autoActions.length > 0
              ? `${autoActions.length} automated action${autoActions.length === 1 ? "" : "s"} recently`
              : "Awaiting first action"}
          </span>
        </div>
        <p className="text-[12px] text-[#86868b]">
          Routes auto-optimize on assignment · Low-battery alerts created idempotently · Anomalies detected (offline / fatigue / blocked) · Every action audited
        </p>
        {autoActions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#008080]/10 space-y-1">
            {autoActions.map((a, i) => (
              <p key={i} className="text-[12px] text-[#1d1d1f]">
                <span className="text-[#008080] mr-1.5">▸</span>
                {a.summary} <span className="text-[#aeaeb2]">· {timeAgo(a.at)}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Decisions waiting */}
      <SectionHeader
        icon={AlertTriangle}
        title="Decisions waiting"
        subtitle="Risks Aiviate flagged that need a human call. Routine actions are already in the audit log above."
      />
      {visibleRecs.length === 0 ? (
        <div className="apple-card p-6 text-center">
          <CheckCircle2 size={18} className="text-[#34c759] mx-auto mb-1.5" />
          <p className="text-[13px] font-semibold text-[#1d1d1f]">No flagged risks right now</p>
          <p className="text-[11px] text-[#86868b] mt-0.5">
            {partial ? "Some sections failed to load — see banner above." : "Detection is running on the latest telemetry."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRecs.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} onAck={onAck} onDismiss={dismiss} />
          ))}
        </div>
      )}

      {/* Unread alerts (compact, inline) */}
      {data.alerts.length > 0 && (
        <>
          <SectionHeader icon={Bell} title="Unread alerts"
            subtitle={`${data.alerts.length} unread from device telemetry`} />
          <div className="space-y-1.5">
            {data.alerts.slice(0, 6).map((a) => {
              const color = SEV[a.severity] || SEV.warning;
              return (
                <div key={a.id} className="apple-card p-3 flex items-center gap-3">
                  <span className="w-1 h-8 rounded-full shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#1d1d1f] truncate">{a.title}</p>
                    <p className="text-[11px] text-[#86868b] truncate">
                      {a.driver_name ? `${a.driver_name} · ` : ""}{a.type} · {timeAgo(a.created_at)}
                    </p>
                  </div>
                  <button onClick={() => onMarkAlertRead(a.id)}
                          className="text-[11px] px-2 py-1 rounded-lg bg-[#f5f5f7] hover:bg-[#ebebed] text-[#1d1d1f]">
                    Mark read
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Jobs */}
      <SectionHeader icon={Radio} title="Jobs"
        subtitle={`${unassignedJobs.length} unassigned · ${activeJobs.length} active`} />
      {data.jobs.length === 0 ? (
        <p className="text-[12px] text-[#86868b] italic">No jobs yet.</p>
      ) : (
        <div className="space-y-1.5">
          {unassignedJobs.map((j) => (
            <div key={j.id} className="apple-card p-3 flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-[#ff9500] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-mono text-[#aeaeb2] truncate">{j.id}</p>
                <p className="text-[13px] text-[#1d1d1f] truncate">
                  {j.area || "Job"} · {j.total_stops || 0} stops · {j.total_distance_km || 0} km
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#ff9500] mr-2">Unassigned</span>
              <label className="sr-only" htmlFor={`assign-${j.id}`}>Assign driver to {j.id}</label>
              <select
                id={`assign-${j.id}`}
                disabled={busy[`job:${j.id}`]}
                onChange={(e) => onAssign(j.id, e.target.value)}
                defaultValue=""
                className="text-[12px] bg-[#f5f5f7] rounded-lg px-2 py-1.5 border border-black/[0.04] focus:outline-none"
              >
                <option value="" disabled>Assign…</option>
                {availableDrivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          ))}
          {activeJobs.map((j) => (
            <div key={j.id} className="apple-card p-3 flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-[#34c759] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-mono text-[#aeaeb2] truncate">{j.id}</p>
                <p className="text-[13px] text-[#1d1d1f] truncate">
                  {j.driver_name || "—"} · {j.area || "Job"} · {j.total_stops || 0} stops · {j.total_distance_km || 0} km
                </p>
              </div>
              <button onClick={() => onOptimize(j.id)} disabled={busy[`job:${j.id}`]}
                      className="text-[11px] px-2 py-1 rounded-lg bg-[#f5f5f7] hover:bg-[#ebebed] text-[#1d1d1f]">
                {busy[`job:${j.id}`] ? "…" : "Optimize"}
              </button>
              <button onClick={() => onUnassign(j.id)} disabled={busy[`job:${j.id}`]}
                      className="text-[11px] text-[#aeaeb2] hover:text-[#ff3b30] px-2 py-1">
                Unassign
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fleet */}
      <SectionHeader icon={Truck} title="Fleet"
        subtitle={`${data.drivers.length} driver${data.drivers.length === 1 ? "" : "s"} · ${data.drivers.filter((d) => d.blocked).length} blocked`} />
      {data.drivers.length === 0 ? (
        <p className="text-[12px] text-[#86868b] italic">No drivers yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.drivers.map((d) => {
            const coord = fmtCoord(d.current_lat, d.current_lng);
            return (
              <div key={d.id} className="apple-card p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                  d.blocked ? "bg-[#ff3b30]/10 text-[#ff3b30]" : "bg-[#34c759]/10 text-[#34c759]"
                }`}>
                  {(d.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{d.name}</p>
                  <p className="text-[11px] text-[#86868b] truncate flex items-center gap-1">
                    {d.blocked ? (
                      <span className="text-[#ff3b30]">Blocked</span>
                    ) : coord ? (
                      <><MapPin size={10} className="inline" />{coord}</>
                    ) : (
                      <span>{d.status || "available"}</span>
                    )}
                  </p>
                </div>
                <button onClick={() => onToggleBlock(d)} disabled={busy[`drv:${d.id}`]}
                        aria-label={d.blocked ? `Unblock ${d.name}` : `Block ${d.name}`}
                        className={`text-[11px] px-2 py-1 rounded-lg ${
                          d.blocked
                            ? "bg-[#34c759]/10 text-[#34c759] hover:bg-[#34c759]/20"
                            : "bg-[#f5f5f7] text-[#86868b] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                        }`}>
                  {busy[`drv:${d.id}`] ? "…" : d.blocked ? "Unblock" : "Block"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Devices needing attention */}
      {(lowBatteryDevices.length > 0 || offlineDevices.length > 0) && (
        <>
          <SectionHeader icon={Battery} title="Devices needing attention"
            subtitle={`${lowBatteryDevices.length} low battery · ${offlineDevices.length} offline`} />
          <div className="space-y-1.5">
            {lowBatteryDevices.map((d) => (
              <div key={d.id} className="apple-card p-3 flex items-center gap-3">
                <Battery size={14} className="text-[#ff9500] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#1d1d1f] truncate">{d.name || d.id}</p>
                  <p className="text-[11px] text-[#86868b]">Battery {d.battery_pct}% — below threshold</p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#ff9500]">Low</span>
              </div>
            ))}
            {offlineDevices.map((d) => (
              <div key={d.id} className="apple-card p-3 flex items-center gap-3">
                <WifiOff size={14} className="text-[#ff3b30] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#1d1d1f] truncate">{d.name || d.id}</p>
                  <p className="text-[11px] text-[#86868b]">
                    {d.last_seen ? `Last seen ${timeAgo(d.last_seen)}` : "Offline"}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#ff3b30]">Offline</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Safety pulse */}
      {recentSafety.length > 0 && (
        <>
          <SectionHeader icon={Eye} title="Recent safety events"
            subtitle="Last events streamed from device telemetry" />
          <div className="space-y-1.5">
            {recentSafety.map((e) => (
              <div key={e.id} className="apple-card p-3 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold w-16 shrink-0"
                      style={{ color: SEV[e.severity] || SEV.medium }}>{e.event_type}</span>
                <p className="text-[12px] text-[#1d1d1f] flex-1 truncate">
                  {e.driver_name || "Unknown driver"}
                </p>
                <span className="text-[11px] text-[#aeaeb2]">{timeAgo(e.timestamp || e.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Audit log */}
      <SectionHeader icon={History} title="Recently handled"
        subtitle="Every automated and human action, in order." />
      {data.audit.length === 0 ? (
        <p className="text-[12px] text-[#86868b] italic">Nothing yet — the audit log is empty.</p>
      ) : (
        <div className="space-y-1">
          {data.audit.slice(0, 12).map((e) => (
            <div key={e.id} className="text-[12px] flex items-start gap-2 py-1.5 border-b border-black/[0.04] last:border-0">
              <span className={`text-[10px] uppercase tracking-wider font-semibold w-20 shrink-0 mt-0.5 ${
                e.actor === "workflow_engine" ? "text-[#008080]" : "text-[#aeaeb2]"
              }`}>
                {e.actor === "workflow_engine" ? "Auto" : "Operator"}
              </span>
              <p className="text-[#1d1d1f] flex-1">{e.summary}</p>
              <span className="text-[10px] text-[#aeaeb2] shrink-0">{timeAgo(e.at)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-[#aeaeb2] text-center mt-10">
        Press <span className="font-mono">⌘K</span> to type a command · Auto-refreshes every 20s · Last sync {lastSyncAt ? timeAgo(lastSyncAt) : "never"}
      </p>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
