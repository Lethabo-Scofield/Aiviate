import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  acknowledgeRecommendation,
  getAuditLog,
  getRecommendations,
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

/** Open the global Ask-Aiviate palette with a pre-filled question. */
function ask(text) {
  window.dispatchEvent(new CustomEvent("ask-aiviate", { detail: { text } }));
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
    <div className="apple-card p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: `${color}1A`, color }}>
        <AlertTriangle size={14} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#1d1d1f]">{rec.what}</p>
        {rec.why && <p className="text-[12px] text-[#86868b] mt-0.5">{rec.why}</p>}
        <p className="text-[12px] text-[#1d1d1f] mt-1.5 flex items-start gap-1.5">
          <Zap size={11} className="text-[#008080] mt-0.5 shrink-0" />
          <span><span className="text-[#86868b]">Suggested: </span>{rec.action}</span>
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button onClick={() => onAck(rec)}
                  className="apple-btn apple-btn-primary text-[11px] py-1 px-2.5">
            <CheckCircle2 size={11} /> Got it
          </button>
          <button onClick={() => onDismiss(rec.id)}
                  className="text-[11px] text-[#aeaeb2] hover:text-[#86868b] ml-auto px-2 py-1">
            <X size={11} className="inline" /> Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── main ─────────────────────────── */
const QUICK_QUESTIONS = [
  "Show me today's routes",
  "How are we doing?",
  "Who's working?",
  "Any problems?",
  "What jobs do I have?",
  "What should I do?",
];

export default function Operations() {
  const { user } = useAuth();
  const [recs, setRecs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
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
      const [recsRes, auditRes] = await Promise.allSettled([
        getRecommendations(),
        getAuditLog(20),
      ]);
      if (myReq !== reqIdRef.current) return;
      setRecs(recsRes.status === "fulfilled" ? (recsRes.value?.recommendations || []) : []);
      setAudit(auditRes.status === "fulfilled" ? (auditRes.value?.entries || []) : []);
      const anyFailed = recsRes.status === "rejected" || auditRes.status === "rejected";
      setLoadError(anyFailed ? "Some sections couldn't be reached" : null);
      setLastSyncAt(new Date().toISOString());
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

  /* ────── loading gate ────── */
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="apple-card p-5">
            <div className="skeleton h-4 w-2/3 mb-2" />
            <div className="skeleton h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const firstName = (user?.name || "").split(" ")[0];
  const calm = visibleRecs.length === 0 && !loadError;
  const headline = loadError
    ? "I'm having trouble reaching some signals — treat them as unknown, not safe."
    : calm
      ? "Everything's calm. I'll let you know if something needs you."
      : `${visibleRecs.length} thing${visibleRecs.length === 1 ? "" : "s"} could use your call.`;

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#1d1d1f] tracking-tight">
            {greeting()}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="text-[14px] text-[#1d1d1f]/80 mt-1.5 max-w-[560px]">
            {headline}
          </p>
        </div>
        <button onClick={load} title="Refresh" aria-label="Refresh"
                className="w-9 h-9 rounded-xl bg-[#f5f5f7] hover:bg-[#ebebed] flex items-center justify-center">
          <RefreshCcw size={14} className="text-[#1d1d1f]" />
        </button>
      </div>

      {/* The single, prominent ask prompt — primary CTA on this page */}
      <button
        onClick={() => ask("")}
        className="w-full apple-card p-4 mb-5 flex items-center gap-3 hover:bg-[#fafafa] transition-colors text-left group"
      >
        <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
          <Sparkles size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#1d1d1f]">Ask Aiviate anything</p>
          <p className="text-[12px] text-[#86868b]">Plain English — maps, lists, assignments, messages to drivers.</p>
        </div>
        <span className="text-[10px] font-mono text-[#aeaeb2] border border-black/[0.08] rounded px-1.5 py-0.5 shrink-0">⌘K</span>
      </button>

      {/* Quick questions — tap to ask, the result opens in the palette */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            className="text-[12px] px-3 py-1.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#ebebed] transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Decisions waiting — the only "to-do" surface */}
      <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-2 mt-2">Needs your call</h2>
      {visibleRecs.length === 0 ? (
        <div className="apple-card p-6 text-center">
          <CheckCircle2 size={18} className="text-[#34c759] mx-auto mb-1.5" />
          <p className="text-[13px] font-semibold text-[#1d1d1f]">Nothing flagged right now</p>
          <p className="text-[11px] text-[#86868b] mt-0.5">
            {loadError ? "Some signals didn't load — refresh to retry." : "Aiviate is watching the fleet in the background."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRecs.map((rec) => (
            <DecisionCard key={rec.id} rec={rec} onAck={onAck} onDismiss={dismiss} />
          ))}
        </div>
      )}

      {/* What Aiviate just did, in human language */}
      {recentAutoActions.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-2 mt-8">What I've done for you</h2>
          <div className="apple-card p-4">
            <div className="space-y-1.5">
              {recentAutoActions.map((a, i) => (
                <p key={i} className="text-[13px] text-[#1d1d1f] flex items-start gap-2">
                  <span className="text-[#008080] mt-0.5">▸</span>
                  <span className="flex-1">{a.summary}</span>
                  <span className="text-[11px] text-[#aeaeb2] shrink-0">{timeAgo(a.at)}</span>
                </p>
              ))}
            </div>
            <button
              onClick={() => ask("what just happened?")}
              className="mt-3 text-[11px] text-[#008080] hover:underline"
            >
              See everything I've handled →
            </button>
          </div>
        </>
      )}

      <p className="text-[10px] text-[#aeaeb2] text-center mt-10">
        Auto-refreshes every 30s · Last sync {lastSyncAt ? timeAgo(lastSyncAt) : "never"}
      </p>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
