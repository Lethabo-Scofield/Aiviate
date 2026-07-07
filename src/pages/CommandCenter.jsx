import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Radar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  Eye,
  Radio,
  X,
  ChevronRight,
  History,
  Zap,
} from "lucide-react";
import {
  getRecommendations,
  acknowledgeRecommendation,
  getAuditLog,
} from "../services/api";

const CATEGORY_META = {
  "Driver risk": { color: "#ff3b30", icon: Eye },
  "Telemetry": { color: "#0a84ff", icon: Camera },
  "Critical alert": { color: "#ff3b30", icon: AlertTriangle },
  "Dispatch": { color: "#ff9500", icon: Radio },
  "Delay": { color: "#ff9500", icon: Clock },
};

const SEVERITY_LABEL = {
  critical: { label: "Critical", color: "#ff3b30" },
  high: { label: "High", color: "#ff3b30" },
  medium: { label: "Medium", color: "#ff9500" },
  low: { label: "Low", color: "#34c759" },
};

const AUTO_PILOT = [
  {
    title: "Route optimization",
    body: "Every job is reordered the moment a driver is assigned.",
  },
  {
    title: "Battery alerts",
    body: "Any device under 20% battery is flagged automatically.",
  },
  {
    title: "Anomaly detection",
    body: "Watches for offline devices, driver fatigue, and blocked drivers.",
  },
  {
    title: "Audit trail",
    body: "Every automatic and manual action is recorded below.",
  },
];

function isCriticalSeverity(sev) {
  return sev === "critical" || sev === "high";
}

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConsoleLabel({ children, accent = "#008080" }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1.5 h-3.5 rounded-full" style={{ background: accent }} />
      <span className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-[#5c636a]">
        {children}
      </span>
    </div>
  );
}

function RecommendationCard({ rec, onAcknowledge, onDismiss, onOpen }) {
  const meta = CATEGORY_META[rec.category] || CATEGORY_META["Delay"];
  const Icon = meta.icon;
  const sev = SEVERITY_LABEL[rec.severity] || SEVERITY_LABEL.medium;
  return (
    <div
      className="apple-card overflow-hidden relative"
      style={{ boxShadow: "0 1px 2px rgba(16,19,21,0.04)" }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: sev.color }}
      />
      <div className="p-4 sm:p-5 pl-5 sm:pl-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${meta.color}1A`, color: meta.color }}
          >
            <Icon size={18} strokeWidth={1.8} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#adb5bd]">
                {rec.category || "Signal"}
              </span>
              <span
                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wider"
                style={{ background: `${sev.color}14`, color: sev.color }}
              >
                {sev.label}
              </span>
            </div>

            <p className="text-[15px] font-semibold text-[#111315] leading-snug">
              {rec.what}
            </p>

            {rec.why && (
              <p className="text-[13px] text-[#868E96] mt-1 leading-relaxed">
                {rec.why}
              </p>
            )}

            <div className="mt-3 rounded-xl bg-[#f8f9fa] border border-black/[0.04] p-3">
              <p className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold mb-1">
                What to do
              </p>
              <p className="text-[13px] text-[#111315] leading-snug">{rec.action}</p>
              {rec.expected_benefit && (
                <p className="text-[12px] text-[#868E96] mt-1.5">
                  Result: {rec.expected_benefit}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => onAcknowledge(rec)}
            className="apple-btn apple-btn-primary text-[13px] py-2 px-4"
          >
            <CheckCircle2 size={14} /> Approve
          </button>
          {rec.link && (
            <button
              onClick={() => onOpen(rec.link)}
              className="apple-btn apple-btn-secondary text-[13px] py-2 px-4"
            >
              Open <ChevronRight size={14} />
            </button>
          )}
          <button
            onClick={() => onDismiss(rec.id)}
            className="text-[13px] text-[#ADB5BD] hover:text-[#868E96] ml-auto px-2 py-1"
          >
            <X size={13} className="inline" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const [recs, setRecs] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [now, setNow] = useState(new Date());
  const [autoCount, setAutoCount] = useState(0);
  const processingRef = useRef(new Set());
  const failedRef = useRef(new Map());
  const AUTO_RETRY_MS = 30000;

  const [autoApprove, setAutoApprove] = useState(() => {
    try { return localStorage.getItem("cc_auto_approve") === "1"; } catch { return false; }
  });
  const [includeCritical, setIncludeCritical] = useState(() => {
    try { return localStorage.getItem("cc_auto_critical") === "1"; } catch { return false; }
  });

  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("dismissedRecs") || "[]")); }
    catch { return new Set(); }
  });

  const load = async () => {
    try {
      const [recResp, auditResp] = await Promise.all([
        getRecommendations(),
        getAuditLog(15),
      ]);
      setRecs(Array.isArray(recResp?.recommendations) ? recResp.recommendations : []);
      setAuditEntries(Array.isArray(auditResp?.entries) ? auditResp.entries : []);
      setLoadError(null);
      setLastSyncAt(new Date().toISOString());
    } catch (e) {
      setLoadError(e?.message || "Could not reach intelligence service");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      sessionStorage.setItem("dismissedRecs", JSON.stringify([...next]));
      return next;
    });
  };

  const undoDismiss = (id) => {
    setDismissed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      sessionStorage.setItem("dismissedRecs", JSON.stringify([...next]));
      return next;
    });
  };

  const acknowledge = async (rec, auto = false) => {
    dismiss(rec.id);
    try {
      await acknowledgeRecommendation(rec.id, {
        summary: `${auto ? "Auto-approved" : "Approved"}: ${rec.what}`,
        kind: rec.kind,
      });
      failedRef.current.delete(rec.id);
      if (auto) setAutoCount((c) => c + 1);
      const fresh = await getAuditLog(15);
      setAuditEntries(Array.isArray(fresh?.entries) ? fresh.entries : []);
    } catch (e) {
      console.warn("Approve failed:", e?.message);
      // Surface the decision again so it is not silently lost.
      undoDismiss(rec.id);
      processingRef.current.delete(rec.id);
      if (auto) failedRef.current.set(rec.id, Date.now());
    }
  };

  // Auto-approve engine: approves incoming decisions for the operator.
  useEffect(() => {
    if (!autoApprove) return;
    const targets = recs.filter((r) => {
      if (dismissed.has(r.id) || processingRef.current.has(r.id)) return false;
      if (!includeCritical && isCriticalSeverity(r.severity)) return false;
      const failedAt = failedRef.current.get(r.id);
      if (failedAt && Date.now() - failedAt < AUTO_RETRY_MS) return false;
      return true;
    });
    if (targets.length === 0) return;
    targets.forEach((r) => processingRef.current.add(r.id));
    (async () => {
      for (const r of targets) {
        await acknowledge(r, true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, autoApprove, includeCritical, dismissed]);

  const toggleAutoApprove = () => {
    setAutoApprove((prev) => {
      const next = !prev;
      try { localStorage.setItem("cc_auto_approve", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const toggleIncludeCritical = () => {
    setIncludeCritical((prev) => {
      const next = !prev;
      try { localStorage.setItem("cc_auto_critical", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const visibleRecs = recs.filter((r) => !dismissed.has(r.id));
  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const online = !loadError || !!lastSyncAt;

  return (
    <div className="animate-fade-in max-w-4xl">
      {/* Command deck */}
      <div
        className="relative overflow-hidden rounded-3xl text-white mb-6"
        style={{ background: "linear-gradient(135deg,#0a1618 0%,#0d2024 55%,#0a1517 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,128,128,0.10) 1px,transparent 1px),linear-gradient(90deg,rgba(0,128,128,0.10) 1px,transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />
        <div
          className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,128,128,0.35) 0%, transparent 70%)" }}
        />

        <div className="relative z-10 p-6 sm:p-7">
          {/* status strip */}
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.16em]">
            <span className="inline-flex items-center gap-2 text-[#4dd0c4]">
              <span
                className={`w-2 h-2 rounded-full ${online ? "animate-pulse" : ""}`}
                style={{ background: online ? "#34c759" : "#ff3b30" }}
              />
              {online ? "System online" : "Signal lost"}
            </span>
            <span className="text-white/40 tabular-nums">{clock}</span>
          </div>

          {/* title */}
          <div className="mt-5 flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-[#008080]/25 border border-[#008080]/40">
              <Radar size={22} className="text-[#4dd0c4]" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-none">
                Command Center
              </h1>
              <p className="text-[13px] text-white/55 mt-1.5 leading-snug max-w-md">
                Live dispatch and safety decisions, routed to you the moment they matter.
              </p>
            </div>
          </div>

          {/* readouts */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3.5 flex items-center gap-4">
              <span
                className="text-[34px] font-semibold leading-none tabular-nums"
                style={{ color: visibleRecs.length > 0 ? "#ff6b60" : "#34c759" }}
              >
                {visibleRecs.length}
              </span>
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-white/45">
                  {visibleRecs.length === 1 ? "Decision waiting" : "Decisions waiting"}
                </p>
                <p className="text-[12px] text-white/60 mt-0.5">
                  {autoCount > 0
                    ? `${autoCount} approved for you this session`
                    : "Approve, open, or dismiss each one"}
                </p>
              </div>
            </div>

            {/* Auto-approve control */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap
                    size={15}
                    className={autoApprove ? "text-[#4dd0c4]" : "text-white/40"}
                  />
                  <span className="text-[13px] font-semibold">Auto-approve</span>
                </div>
                <button
                  role="switch"
                  aria-checked={autoApprove}
                  onClick={toggleAutoApprove}
                  className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                  style={{ background: autoApprove ? "#008080" : "rgba(255,255,255,0.18)" }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{ transform: autoApprove ? "translateX(20px)" : "translateX(0)" }}
                  />
                </button>
              </div>
              <p className="text-[12px] text-white/55 mt-1.5 leading-snug">
                {autoApprove
                  ? "New decisions are approved automatically."
                  : "Turn on to approve incoming decisions for you."}
              </p>
              {autoApprove && (
                <label className="mt-2.5 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeCritical}
                    onChange={toggleIncludeCritical}
                    className="w-3.5 h-3.5 rounded accent-[#008080]"
                  />
                  <span className="text-[12px] text-white/70">
                    Also approve critical decisions
                  </span>
                </label>
              )}
              {autoApprove && !includeCritical && (
                <p className="text-[11px] text-[#ffb84d] mt-1.5 leading-snug">
                  Critical decisions still wait for you.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="apple-card p-6">
              <div className="skeleton h-4 w-2/3 mb-2" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Decisions list */}
          <ConsoleLabel accent="#ff3b30">Needs your decision</ConsoleLabel>
          {loadError && !lastSyncAt ? (
            <div className="apple-card p-10 text-center border-2 border-[#ff3b30]/20">
              <div className="w-14 h-14 rounded-2xl bg-[#ff3b30]/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={22} className="text-[#ff3b30]" />
              </div>
              <p className="text-[16px] font-semibold text-[#111315]">Intelligence service unreachable</p>
              <p className="text-[13px] text-[#868E96] mt-1">
                We cannot tell you what is happening right now. Treat this as unknown, not safe. ({loadError})
              </p>
              <button
                onClick={() => { setLoading(true); load(); }}
                className="apple-btn apple-btn-secondary text-[13px] py-2 px-4 mt-4"
              >
                Retry
              </button>
            </div>
          ) : visibleRecs.length === 0 ? (
            recs.length === 0 ? (
              <div className="apple-card p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#34c759]/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={22} className="text-[#34c759]" />
                </div>
                <p className="text-[16px] font-semibold text-[#111315]">You are all caught up</p>
                <p className="text-[13px] text-[#868E96] mt-1">
                  No drowsy drivers, no offline devices, no open critical alerts, and no blocked routes.
                </p>
                {loadError && (
                  <p className="text-[11px] text-[#ff9500] mt-2">
                    Last refresh failed. Showing the last known state from {timeAgo(lastSyncAt)}.
                  </p>
                )}
              </div>
            ) : (
              <div className="apple-card p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#ADB5BD]/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={22} className="text-[#868E96]" />
                </div>
                <p className="text-[16px] font-semibold text-[#111315]">
                  All {recs.length} handled this session
                </p>
                <p className="text-[13px] text-[#868E96] mt-1">
                  {autoApprove
                    ? "Auto-approve is clearing decisions as they arrive."
                    : "The underlying risks may still be active. Approving only hides the card."}
                </p>
                <button
                  onClick={() => { setDismissed(new Set()); sessionStorage.removeItem("dismissedRecs"); }}
                  className="apple-btn apple-btn-secondary text-[13px] py-2 px-4 mt-4"
                >
                  Show dismissed
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {visibleRecs.map((r) => (
                <RecommendationCard
                  key={r.id}
                  rec={r}
                  onAcknowledge={(rec) => acknowledge(rec, false)}
                  onDismiss={dismiss}
                  onOpen={(link) => navigate(link)}
                />
              ))}
            </div>
          )}

          {/* Running automatically */}
          <div className="mt-8">
            <ConsoleLabel accent="#34c759">Running automatically</ConsoleLabel>
            <div className="apple-card p-5">
              <p className="text-[13px] text-[#868E96] mb-4">
                These tasks happen on their own. You never have to approve them, they just show up in the log below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {AUTO_PILOT.map((item) => (
                  <div key={item.title} className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-[#34c759] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[13px] font-semibold text-[#111315]">{item.title}</p>
                      <p className="text-[12px] text-[#868E96] leading-snug mt-0.5">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              {auditEntries.filter((e) => e.actor === "workflow_engine").length > 0 && (
                <div className="mt-4 pt-4 border-t border-black/[0.06]">
                  <p className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold mb-1">
                    Latest automatic action
                  </p>
                  <p className="text-[13px] text-[#111315]">
                    {auditEntries.filter((e) => e.actor === "workflow_engine")[0].summary}{" "}
                    <span className="text-[#ADB5BD]">
                      · {timeAgo(auditEntries.filter((e) => e.actor === "workflow_engine")[0].at)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Recently handled */}
          <div className="mt-8">
            <ConsoleLabel accent="#008080">
              <span className="inline-flex items-center gap-1.5">
                <History size={12} /> Recently handled
              </span>
            </ConsoleLabel>
            {auditEntries.length === 0 ? (
              <div className="apple-card p-5 text-center">
                <p className="text-[13px] text-[#868E96]">
                  Nothing logged yet. Automatic tasks and the actions you take will appear here.
                </p>
              </div>
            ) : (
              <div className="apple-card divide-y divide-black/[0.06]">
                {auditEntries.map((e) => {
                  const isAuto = e.actor === "workflow_engine";
                  const label =
                    e.summary && e.summary.startsWith("Auto-approved")
                      ? "Auto-approved"
                      : isAuto
                        ? "Automatic"
                        : "You";
                  return (
                    <div key={e.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#008080]/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={13} className="text-[#008080]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#111315] leading-snug">{e.summary}</p>
                        <p className="text-[11px] text-[#868E96] mt-0.5 font-mono uppercase tracking-wider">
                          {label} · {timeAgo(e.at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
