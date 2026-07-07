import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  AlertTriangle,
  Camera,
  Eye,
  Radio,
  ChevronRight,
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
  { title: "Route optimization", body: "Every job is reordered the moment a driver is assigned." },
  { title: "Battery alerts", body: "Any device under 20% battery is flagged automatically." },
  { title: "Anomaly detection", body: "Watches for offline devices, driver fatigue, and blocked drivers." },
  { title: "Audit trail", body: "Every automatic and manual action is recorded below." },
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

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-[#adb5bd] font-medium mb-6">
      {children}
    </p>
  );
}

function RecommendationRow({ rec, onAcknowledge, onDismiss, onOpen }) {
  const sev = SEVERITY_LABEL[rec.severity] || SEVERITY_LABEL.medium;
  return (
    <article className="py-8 first:pt-0">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sev.color }} />
        <span
          className="text-[11px] uppercase tracking-[0.14em] font-medium"
          style={{ color: sev.color }}
        >
          {sev.label}
        </span>
        {rec.category && (
          <span className="text-[12px] text-[#adb5bd]">· {rec.category}</span>
        )}
      </div>

      <h3 className="text-[18px] font-medium text-[#111315] tracking-tight leading-snug">
        {rec.what}
      </h3>

      {rec.why && (
        <p className="text-[14px] text-[#868E96] mt-2 leading-relaxed max-w-xl">
          {rec.why}
        </p>
      )}

      <div className="mt-4 pl-4 border-l border-[#e9ecef]">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[#adb5bd] mb-1">
          Recommended
        </p>
        <p className="text-[14px] text-[#343a40] leading-snug">{rec.action}</p>
        {rec.expected_benefit && (
          <p className="text-[13px] text-[#adb5bd] mt-1">{rec.expected_benefit}</p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-5">
        <button
          onClick={() => onAcknowledge(rec)}
          className="text-[13px] font-medium text-[#008080] border border-[#008080]/30 rounded-full px-4 py-1.5 hover:bg-[#008080]/[0.06] transition-colors"
        >
          Approve
        </button>
        {rec.link && (
          <button
            onClick={() => onOpen(rec.link)}
            className="text-[13px] text-[#5c636a] hover:text-[#111315] transition-colors inline-flex items-center gap-1"
          >
            Open <ChevronRight size={13} />
          </button>
        )}
        <button
          onClick={() => onDismiss(rec.id)}
          className="text-[13px] text-[#adb5bd] hover:text-[#868E96] transition-colors ml-auto"
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const [recs, setRecs] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
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
  const pending = visibleRecs.length > 0;
  const autoActions = auditEntries.filter((e) => e.actor === "workflow_engine");

  return (
    <div className="animate-fade-in max-w-2xl mx-auto px-1 pt-2">
      {/* Header */}
      <header className="mb-14">
        <h1 className="text-[32px] sm:text-[38px] font-light text-[#111315] tracking-tight leading-none">
          Command Center
        </h1>
        <p className="text-[15px] text-[#868E96] mt-4 leading-relaxed max-w-lg font-light">
          Live dispatch and safety decisions, routed to you the moment they matter.
        </p>
      </header>

      {/* Overview line */}
      <div className="flex items-end justify-between gap-8 pb-8 border-b border-[#eceef0]">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: pending ? "#ff3b30" : "#34c759" }}
            />
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#adb5bd] font-medium">
              {visibleRecs.length === 1 ? "Decision waiting" : "Decisions waiting"}
            </p>
          </div>
          <p className="text-[52px] font-extralight text-[#111315] leading-none tracking-tight tabular-nums">
            {visibleRecs.length}
          </p>
          {autoCount > 0 && (
            <p className="text-[12px] text-[#adb5bd] mt-3">
              {autoCount} approved for you this session
            </p>
          )}
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-center gap-3 justify-end">
            <span className="text-[13px] text-[#343a40] font-medium">Auto-approve</span>
            <button
              role="switch"
              aria-checked={autoApprove}
              aria-label="Toggle auto-approve"
              onClick={toggleAutoApprove}
              className="relative w-10 h-[22px] rounded-full transition-colors shrink-0"
              style={{ background: autoApprove ? "#008080" : "#dee2e6" }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: autoApprove ? "translateX(18px)" : "translateX(0)" }}
              />
            </button>
          </div>
          <p className="text-[12px] text-[#adb5bd] mt-2.5 max-w-[220px] ml-auto leading-relaxed font-light">
            {autoApprove
              ? "New decisions are approved automatically."
              : "Approve incoming decisions for you."}
          </p>
          {autoApprove && (
            <label className="mt-3 flex items-center gap-2 justify-end cursor-pointer select-none">
              <span className="text-[12px] text-[#5c636a]">Include critical</span>
              <input
                type="checkbox"
                checked={includeCritical}
                onChange={toggleIncludeCritical}
                className="w-3.5 h-3.5 rounded accent-[#008080]"
              />
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mt-12 space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="skeleton h-3 w-24 mb-3" />
              <div className="skeleton h-5 w-2/3 mb-2" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Decisions */}
          <section className="mt-12">
            <SectionLabel>Needs your decision</SectionLabel>
            {loadError && !lastSyncAt ? (
              <div className="py-8">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff3b30]" />
                  <span className="text-[11px] uppercase tracking-[0.14em] font-medium text-[#ff3b30]">
                    Signal lost
                  </span>
                </div>
                <h3 className="text-[18px] font-medium text-[#111315] tracking-tight">
                  Intelligence service unreachable
                </h3>
                <p className="text-[14px] text-[#868E96] mt-2 leading-relaxed max-w-xl">
                  We cannot tell you what is happening right now. Treat this as unknown, not safe. ({loadError})
                </p>
                <button
                  onClick={() => { setLoading(true); load(); }}
                  className="mt-5 text-[13px] font-medium text-[#008080] border border-[#008080]/30 rounded-full px-4 py-1.5 hover:bg-[#008080]/[0.06] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : visibleRecs.length === 0 ? (
              recs.length === 0 ? (
                <div className="py-8">
                  <p className="text-[18px] font-light text-[#111315] tracking-tight">
                    You are all caught up.
                  </p>
                  <p className="text-[14px] text-[#868E96] mt-2 leading-relaxed max-w-xl">
                    No drowsy drivers, no offline devices, no open critical alerts, and no blocked routes.
                  </p>
                  {loadError && (
                    <p className="text-[12px] text-[#ff9500] mt-3">
                      Last refresh failed. Showing the last known state from {timeAgo(lastSyncAt)}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-8">
                  <p className="text-[18px] font-light text-[#111315] tracking-tight">
                    All {recs.length} handled this session.
                  </p>
                  <p className="text-[14px] text-[#868E96] mt-2 leading-relaxed max-w-xl">
                    {autoApprove
                      ? "Auto-approve is clearing decisions as they arrive."
                      : "The underlying risks may still be active. Approving only hides the card."}
                  </p>
                  <button
                    onClick={() => { setDismissed(new Set()); sessionStorage.removeItem("dismissedRecs"); }}
                    className="mt-5 text-[13px] text-[#5c636a] hover:text-[#111315] transition-colors"
                  >
                    Show dismissed
                  </button>
                </div>
              )
            ) : (
              <div className="divide-y divide-[#eceef0]">
                {visibleRecs.map((r) => (
                  <RecommendationRow
                    key={r.id}
                    rec={r}
                    onAcknowledge={(rec) => acknowledge(rec, false)}
                    onDismiss={dismiss}
                    onOpen={(link) => navigate(link)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Running automatically */}
          <section className="mt-16 pt-12 border-t border-[#eceef0]">
            <SectionLabel>Running automatically</SectionLabel>
            <p className="text-[14px] text-[#868E96] mb-7 leading-relaxed max-w-xl font-light">
              These tasks happen on their own. You never have to approve them, they just show up in the log below.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
              {AUTO_PILOT.map((item) => (
                <div key={item.title} className="border-l border-[#e9ecef] pl-4">
                  <p className="text-[14px] font-medium text-[#111315]">{item.title}</p>
                  <p className="text-[13px] text-[#868E96] leading-relaxed mt-1 font-light">{item.body}</p>
                </div>
              ))}
            </div>
            {autoActions.length > 0 && (
              <p className="text-[13px] text-[#adb5bd] mt-8">
                Latest: {autoActions[0].summary}
                <span className="text-[#ced2d6]"> · {timeAgo(autoActions[0].at)}</span>
              </p>
            )}
          </section>

          {/* Recently handled */}
          <section className="mt-16 pt-12 border-t border-[#eceef0]">
            <SectionLabel>Recently handled</SectionLabel>
            {auditEntries.length === 0 ? (
              <p className="text-[14px] text-[#868E96] font-light">
                Nothing logged yet. Automatic tasks and the actions you take will appear here.
              </p>
            ) : (
              <div className="space-y-5">
                {auditEntries.map((e) => {
                  const isAuto = e.actor === "workflow_engine";
                  const label =
                    e.summary && e.summary.startsWith("Auto-approved")
                      ? "Auto-approved"
                      : isAuto
                        ? "Automatic"
                        : "You";
                  return (
                    <div key={e.id} className="flex items-baseline gap-4">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[#adb5bd] w-24 shrink-0">
                        {label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-[#343a40] leading-snug">{e.summary}</p>
                        <p className="text-[12px] text-[#ced2d6] mt-0.5">{timeAgo(e.at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="h-16" />
        </>
      )}
    </div>
  );
}
