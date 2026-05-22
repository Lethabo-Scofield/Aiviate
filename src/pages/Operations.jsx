import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Plus,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  acknowledgeRecommendation,
  getAuditLog,
  getRecommendations,
  getStats,
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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const SEV_COLOR = {
  critical: "#ff3b30", high: "#ff3b30", medium: "#ff9500", low: "#34c759",
  warning: "#ff9500", info: "#008080",
};

/** Fire the global ask-aiviate event so the palette opens and runs the query. */
function ask(text) {
  window.dispatchEvent(new CustomEvent("ask-aiviate", { detail: { text: text || "" } }));
}

/* ─────────────────────────── small bits ─────────────────────────── */
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

function DecisionCard({ rec, onAck, onDismiss }) {
  const color = SEV_COLOR[rec.severity] || SEV_COLOR.medium;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3 flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
           style={{ background: `${color}1A`, color }}>
        <AlertTriangle size={13} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-[#1d1d1f] leading-snug">{rec.what}</p>
        {rec.why && <p className="text-[11.5px] text-[#86868b] mt-0.5 leading-snug">{rec.why}</p>}
        <p className="text-[11.5px] text-[#1d1d1f] mt-1.5 flex items-start gap-1.5">
          <Zap size={10} className="text-[#008080] mt-0.5 shrink-0" />
          <span><span className="text-[#86868b]">Suggested: </span>{rec.action}</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => onAck(rec)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-[#008080] hover:bg-[#006666] text-white flex items-center gap-1">
            <CheckCircle2 size={11} /> Got it
          </button>
          <button onClick={() => onDismiss(rec.id)}
                  className="text-[11px] text-[#aeaeb2] hover:text-[#86868b] ml-auto px-2 py-1">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── prompts ─────────────────────────── */
const QUICK_QUESTIONS = [
  "Show me today's routes",
  "Who's working?",
  "Any problems?",
];

/* ─────────────────────────── main ─────────────────────────── */
export default function Operations() {
  const { user } = useAuth();
  const [recs, setRecs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);
  const [askText, setAskText] = useState("");
  const askRef = useRef(null);
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
      const [recsRes, auditRes, statsRes] = await Promise.allSettled([
        getRecommendations(),
        getAuditLog(20),
        getStats(),
      ]);
      if (myReq !== reqIdRef.current) return;
      setRecs(recsRes.status === "fulfilled" ? (recsRes.value?.recommendations || []) : []);
      setAudit(auditRes.status === "fulfilled" ? (auditRes.value?.entries || []) : []);
      setStats(statsRes.status === "fulfilled" ? statsRes.value : null);
      const anyFailed = [recsRes, auditRes, statsRes].some((r) => r.status === "rejected");
      setLoadError(anyFailed ? "Some signals couldn't be reached" : null);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setLoadError(e?.message || "Couldn't reach Aiviate");
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const visibleRecs = useMemo(
    () => recs.filter((r) => !dismissed.has(r.id)),
    [recs, dismissed]
  );
  const recentAutoActions = useMemo(
    () => audit.filter((e) => e.actor === "workflow_engine" || e.actor === "dispatch").slice(0, 4),
    [audit]
  );

  const dismiss = (id) => {
    const next = new Set(dismissed); next.add(id);
    setDismissed(next);
    sessionStorage.setItem("dismissedRecs", JSON.stringify([...next]));
  };

  const onAck = async (rec) => {
    dismiss(rec.id);
    try {
      await acknowledgeRecommendation(rec.id, { summary: `Acknowledged: ${rec.what}` });
      notify("Got it — logged in your audit trail");
      await load();
    } catch (e) {
      notify(`Couldn't acknowledge: ${e?.message || "unknown error"}`, "error");
    }
  };

  const submitAsk = (e) => {
    e?.preventDefault?.();
    const q = askText.trim();
    if (!q) { askRef.current?.focus(); return; }
    setAskText("");
    ask(q);
  };

  const firstName = (user?.name || "").split(" ")[0] || "there";

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="animate-fade-in">
      {/* Hero — centered greeting */}
      <div className="text-center pt-6 sm:pt-10 mb-5">
        <h1 className="text-[24px] sm:text-[30px] font-semibold text-[#1d1d1f] tracking-tight flex items-center justify-center gap-2.5 flex-wrap">
          <Sparkles size={20} className="text-[#008080]" />
          Hi {firstName}, what can Aiviate cross off your list?
        </h1>
      </div>

      {/* Big rounded pill prompt — centered */}
      <form
        onSubmit={submitAsk}
        className="max-w-[680px] mx-auto mb-4"
      >
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-full bg-white border border-black/[0.08] shadow-[0_2px_18px_rgba(0,0,0,0.04)] focus-within:border-[#008080]/40 focus-within:shadow-[0_2px_22px_rgba(0,128,128,0.10)] transition-all">
          <button
            type="button"
            onClick={() => ask("")}
            title="More commands"
            aria-label="More commands"
            className="w-7 h-7 rounded-full bg-[#f5f5f7] hover:bg-[#ebebed] text-[#1d1d1f] flex items-center justify-center shrink-0"
          >
            <Plus size={14} />
          </button>
          <input
            ref={askRef}
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder='Ask Aiviate, "show me today\u2019s routes."'
            aria-label="Ask Aiviate"
            className="flex-1 bg-transparent outline-none text-[14px] text-[#1d1d1f] placeholder:text-[#86868b]"
          />
          <button
            type="submit"
            aria-label="Ask"
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              askText.trim()
                ? "bg-[#008080] hover:bg-[#006666] text-white"
                : "bg-[#f5f5f7] text-[#aeaeb2]"
            }`}
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </form>

      {/* Quick-question pills */}
      <div className="flex flex-wrap gap-2 justify-center mb-10">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            className="text-[12.5px] px-3.5 py-1.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#ebebed] transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Load error banner (honest) */}
      {loadError && (
        <div className="max-w-[680px] mx-auto mb-6 rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/[0.04] p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-[#ff9500] mt-0.5 shrink-0" />
          <p className="text-[12px] text-[#1d1d1f]">
            <span className="font-semibold">Heads up:</span> {loadError}. Treat those sections as unknown, not safe.
          </p>
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Inbox / Needs your call */}
        <div className="rounded-2xl bg-[#0b1220] text-white p-4 sm:p-5 flex flex-col min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={14} className="opacity-80" />
            <p className="text-[12px] uppercase tracking-wider font-semibold opacity-80">Needs your call</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-4 w-2/3 opacity-30" />
              <div className="skeleton h-3 w-full opacity-30" />
            </div>
          ) : visibleRecs.length === 0 ? (
            <div className="flex-1 flex flex-col">
              <p className="text-[20px] font-semibold leading-tight">
                <span className="text-[#34c759]">All clear.</span>
              </p>
              <p className="text-[13px] opacity-80 mt-1.5">
                Nothing needs you right now. Aiviate is watching the fleet in the background.
              </p>
              <button
                onClick={() => ask("what should I do?")}
                className="mt-auto text-[12px] font-medium text-white/90 hover:text-white inline-flex items-center gap-1"
              >
                Ask what to focus on <ArrowUpRight size={12} />
              </button>
            </div>
          ) : (
            <>
              <p className="text-[20px] font-semibold leading-tight">
                <span className="text-[#34c759]">{visibleRecs.length} {visibleRecs.length === 1 ? "decision" : "decisions"}</span>{" "}
                need attention.
              </p>
              <div className="mt-3 space-y-2 overflow-y-auto max-h-[280px] pr-1">
                {visibleRecs.slice(0, 3).map((rec) => (
                  <DecisionCard key={rec.id} rec={rec} onAck={onAck} onDismiss={dismiss} />
                ))}
              </div>
              {visibleRecs.length > 3 && (
                <button
                  onClick={() => ask("what should I do?")}
                  className="mt-auto pt-3 text-[12px] font-medium text-white/90 hover:text-white inline-flex items-center gap-1 self-start"
                >
                  See all {visibleRecs.length} <ArrowUpRight size={12} />
                </button>
              )}
            </>
          )}
        </div>

        {/* What I've done for you */}
        <div className="rounded-2xl bg-white border border-black/[0.06] p-4 sm:p-5 flex flex-col min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-[#008080]" />
            <p className="text-[12px] uppercase tracking-wider font-semibold text-[#86868b]">What I've done for you</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ) : recentAutoActions.length === 0 ? (
            <p className="text-[13px] text-[#86868b]">
              No automated actions yet — once you assign jobs or telemetry rolls in, I'll log it all here.
            </p>
          ) : (
            <div className="space-y-2 flex-1">
              {recentAutoActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px] text-[#1d1d1f]">
                  <span className="text-[#008080] mt-0.5">▸</span>
                  <span className="flex-1">{a.summary}</span>
                  <span className="text-[11px] text-[#aeaeb2] shrink-0 mt-0.5">{timeAgo(a.at)}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => ask("what just happened?")}
            className="mt-3 text-[12px] font-medium text-[#008080] hover:underline inline-flex items-center gap-1 self-start"
          >
            See everything I've handled <ArrowUpRight size={12} />
          </button>
        </div>

        {/* Quick looks — light stats */}
        <div className="rounded-2xl bg-white border border-black/[0.06] p-4 sm:p-5 flex flex-col min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[12px] uppercase tracking-wider font-semibold text-[#86868b]">Quick looks</p>
          </div>
          {loading || !stats ? (
            <div className="space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ) : (
            <div className="space-y-2.5">
              <button
                onClick={() => ask("show me today's routes")}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#f5f5f7] text-left transition-colors"
              >
                <span className="text-[12.5px] text-[#1d1d1f]">Today's stops</span>
                <span className="text-[14px] font-semibold text-[#1d1d1f]">{stats.stops_today ?? 0}</span>
              </button>
              <button
                onClick={() => ask("who's working?")}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#f5f5f7] text-left transition-colors"
              >
                <span className="text-[12.5px] text-[#1d1d1f]">Active drivers</span>
                <span className="text-[14px] font-semibold text-[#1d1d1f]">
                  {stats.active_drivers ?? 0}<span className="text-[11px] text-[#aeaeb2] font-normal"> / {stats.total_drivers ?? 0}</span>
                </span>
              </button>
              <button
                onClick={() => ask("show unassigned jobs")}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#f5f5f7] text-left transition-colors"
              >
                <span className="text-[12.5px] text-[#1d1d1f]">Unassigned jobs</span>
                <span className={`text-[14px] font-semibold ${
                  (stats.unassigned ?? 0) > 0 ? "text-[#ff9500]" : "text-[#34c759]"
                }`}>{stats.unassigned ?? 0}</span>
              </button>
              <button
                onClick={() => ask("any problems?")}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#f5f5f7] text-left transition-colors"
              >
                <span className="text-[12.5px] text-[#1d1d1f]">Unread alerts</span>
                <span className={`text-[14px] font-semibold ${
                  (stats.unread_alerts ?? 0) > 0 ? "text-[#ff3b30]" : "text-[#34c759]"
                }`}>{stats.unread_alerts ?? 0}</span>
              </button>
            </div>
          )}
          <p className="text-[10.5px] text-[#aeaeb2] mt-3">
            Tap any row to ask Aiviate about it.
          </p>
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
