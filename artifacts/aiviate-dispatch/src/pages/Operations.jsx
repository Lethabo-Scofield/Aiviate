import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Eye,
  Inbox,
  MapPin,
  Package,
  Plus,
  Users,
  X,
  Zap,
} from "lucide-react";

/** Shared iOS-feel spring used for tactile press feedback throughout this page. */
const TAP_SPRING = { type: "tween", duration: 0.14, ease: [0.2, 0, 0, 1] };
import { useAuth } from "../contexts/AuthContext";
import {
  acknowledgeRecommendation,
  getAuditLog,
  getAutopilotStatus,
  getRecommendations,
  getStats,
  runAutopilot,
  sendCommand,
  updateAutopilotSettings,
} from "../services/api";
import ResultBlock from "../components/ResultBlock";
import { takePendingAsk } from "../lib/askBus";

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
  critical: "#343A40", high: "#343A40", medium: "#868E96", low: "#5C636A",
  warning: "#868E96", info: "#111315",
};

/* ─────────────────────────── small bits ─────────────────────────── */
function Toast({ toast, onClose }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3"
          style={{ background: toast.kind === "error" ? "#343A40" : "#111315", color: "white" }}
        >
          <span className="text-[13px]">{toast.message}</span>
          <motion.button
            onClick={onClose}
            aria-label="Dismiss notification"
            whileTap={{ scale: 0.85 }}
            className="opacity-70 hover:opacity-100"
          >
            <X size={13} />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function severityLabel(sev) {
  if (sev === "critical" || sev === "high") return "Critical";
  if (sev === "medium" || sev === "warning") return "Needs eyes";
  if (sev === "low" || sev === "info") return "Heads up";
  return "Heads up";
}

function actionDetails(action) {
  const details = action?.details || {};
  return {
    title: details.title || action?.summary || "Completed Autopilot task",
    status: details.status || "Completed",
    owner: details.owner || "Autopilot",
    confidence: details.confidence || Math.round((action?.confidence || 0.99) * 100),
    inputs: details.inputs || [
      `${details.open_jobs ?? 0} open route(s)`,
      `${details.unassigned_jobs ?? 0} unassigned job(s)`,
      `${details.active_alerts ?? 0} unread alert(s)`,
    ],
    steps: details.steps || [
      "Checked dispatch data",
      "Prepared the operational summary",
      "Saved the action to the Autopilot trail",
    ],
    outcome: details.outcome || action?.summary || "Task completed.",
    nextFocus: details.nextFocus || "Ask Aiviate what should happen next.",
  };
}

/** Inbox-style row used inside the dark "Needs your call" card. */
function InboxRow({ rec, onAck, onDismiss }) {
  const color = SEV_COLOR[rec.severity] || SEV_COLOR.medium;
  const label = severityLabel(rec.severity);
  const initials = (rec.driver_name || rec.area || "AI").slice(0, 2).toUpperCase();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, x: 40 }}
      transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      className="rounded-xl bg-white/[0.06] hover:bg-white/[0.09] transition-colors p-3"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: `${color}26`, color }}
        >
          {label}
        </span>
        {rec.created_at && (
          <span className="text-[10px] text-white/50">{timeAgo(rec.created_at)}</span>
        )}
      </div>
      <div className="flex items-start gap-3">
        <p className="text-[13px] font-medium text-white/95 flex-1 leading-snug">{rec.what}</p>
        <div
          className="w-7 h-7 rounded-full bg-white/[0.12] text-white/80 text-[10px] font-semibold flex items-center justify-center shrink-0"
          aria-hidden
        >
          {initials}
        </div>
      </div>
      {rec.action && (
        <p className="text-[11.5px] text-white/70 mt-1.5 flex items-start gap-1.5">
          <Zap size={10} className="text-[#5C636A] mt-0.5 shrink-0" />
          <span>{rec.action}</span>
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <motion.button
          onClick={() => onAck(rec)}
          whileTap={{ scale: 0.94 }}
          transition={TAP_SPRING}
          className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white text-[#0b1220] hover:bg-white/90 flex items-center gap-1"
        >
          <CheckCircle2 size={11} /> Got it
        </motion.button>
        <motion.button
          onClick={() => onDismiss(rec.id)}
          whileTap={{ scale: 0.94 }}
          transition={TAP_SPRING}
          className="text-[11px] text-white/50 hover:text-white/80 ml-auto px-2 py-1"
        >
          Not now
        </motion.button>
      </div>
    </motion.div>
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
  const [autopilot, setAutopilot] = useState(null);
  const [autopilotBusy, setAutopilotBusy] = useState(false);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);
  const [askText, setAskText] = useState("");
  const askRef = useRef(null);

  // ─── Inline chat surface ────────────────────────────────────────────
  // The whole Home page transforms into a chat view when the user asks
  // something. `thread` is the live conversation; `mode` controls layout.
  const [thread, setThread] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const mode = thread.length > 0 ? "chat" : "idle";
  const threadEndRef = useRef(null);

  const askHere = useCallback(async (raw) => {
    const text = (raw ?? "").trim();
    if (!text) {
      askRef.current?.focus();
      return;
    }
    setAskText("");
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setThread((t) => [...t, { id, input: text, busy: true, result: null }]);
    setChatBusy(true);
    try {
      const r = await sendCommand(text);
      setThread((t) => t.map((m) => (m.id === id ? { ...m, busy: false, result: r } : m)));
    } catch (e) {
      setThread((t) => t.map((m) => (m.id === id
        ? { ...m, busy: false, result: { ok: false, summary: e?.message || "Couldn't reach Aiviate" } }
        : m)));
    } finally {
      setChatBusy(false);
      setTimeout(() => askRef.current?.focus(), 30);
    }
  }, []);

  // Listen for "home:ask" events fired from the global Layout (top-bar
  // input, mobile FAB, ⌘K, sidebar, etc.). Empty text just focuses the
  // input; otherwise it kicks off a chat turn.
  useEffect(() => {
    const onHomeAsk = (e) => {
      const text = (e?.detail?.text || "").trim();
      if (!text) {
        askRef.current?.focus();
      } else {
        askHere(text);
      }
    };
    window.addEventListener("home:ask", onHomeAsk);
    return () => window.removeEventListener("home:ask", onHomeAsk);
  }, [askHere]);

  // Drain any ask queued by Layout *before* this component mounted
  // (i.e. the user submitted an Ask from a different route and we
  // navigated here). Runs exactly once on mount.
  useEffect(() => {
    const pending = takePendingAsk();
    if (pending === null) return;
    if (pending === "") {
      askRef.current?.focus();
    } else {
      askHere(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to the bottom of the thread on new turns.
  useEffect(() => {
    if (mode === "chat") {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [thread, mode]);

  const resetChat = () => setThread([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("dismissedRecs") || "[]")); }
    catch { return new Set(); }
  });
  const reqIdRef = useRef(0);
  const autonomousLaunchRef = useRef(false);

  const notify = (message, kind = "info") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    try {
      const [recsRes, auditRes, statsRes, autopilotRes] = await Promise.allSettled([
        getRecommendations(),
        getAuditLog(20),
        getStats(),
        getAutopilotStatus(),
      ]);
      if (myReq !== reqIdRef.current) return;
      setRecs(recsRes.status === "fulfilled" ? (recsRes.value?.recommendations || []) : []);
      setAudit(auditRes.status === "fulfilled" ? (auditRes.value?.entries || []) : []);
      setStats(statsRes.status === "fulfilled" ? statsRes.value : null);
      setAutopilot(autopilotRes.status === "fulfilled" ? autopilotRes.value : null);
      const anyFailed = [recsRes, auditRes, statsRes, autopilotRes].some((r) => r.status === "rejected");
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

  const refreshAutopilot = useCallback(async () => {
    try {
      setAutopilot(await getAutopilotStatus());
    } catch {
      // Main load banner already reports unreachable signals.
    }
  }, []);

  const setAutopilotSettings = async (payload) => {
    setAutopilotBusy(true);
    try {
      const res = await updateAutopilotSettings(payload);
      setAutopilot((current) => ({ ...(current || {}), settings: res.settings }));
      notify(payload.enabled === false ? "Autopilot paused" : "Autopilot settings updated");
      await refreshAutopilot();
    } catch (e) {
      notify(e?.message || "Couldn't update Autopilot", "error");
    } finally {
      setAutopilotBusy(false);
    }
  };

  const runAutopilotNow = async (force = false) => {
    setAutopilotBusy(true);
    try {
      const res = await runAutopilot(force);
      notify(res.summary || "Autopilot checked the operation");
      await load();
    } catch (e) {
      notify(e?.message || "Autopilot couldn't run", "error");
    } finally {
      setAutopilotBusy(false);
    }
  };

  useEffect(() => {
    if (loading || !autopilot || autonomousLaunchRef.current) return;
    autonomousLaunchRef.current = true;

    const launchAutonomous = async () => {
      setAutopilotBusy(true);
      try {
        const settings = autopilot?.settings || {};
        const needsAutonomous =
          !settings.enabled ||
          settings.mode !== "autonomous" ||
          !settings.auto_assign ||
          !settings.auto_optimize ||
          !settings.auto_notify;

        if (needsAutonomous) {
          await updateAutopilotSettings({
            enabled: true,
            mode: "autonomous",
            auto_assign: true,
            auto_optimize: true,
            auto_notify: true,
          });
        }

        const res = await runAutopilot(true);
        notify(res.summary || "Autopilot started and checked the operation");
        await load();
      } catch (e) {
        notify(e?.message || "Autopilot couldn't start", "error");
      } finally {
        setAutopilotBusy(false);
      }
    };

    launchAutonomous();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autopilot, load]);

  useEffect(() => {
    if (!autopilot?.settings?.enabled || autopilot?.settings?.mode === "manual") return undefined;
    const id = setInterval(() => runAutopilotNow(false), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot?.settings?.enabled, autopilot?.settings?.mode]);

  const visibleRecs = useMemo(
    () => recs.filter((r) => !dismissed.has(r.id)),
    [recs, dismissed]
  );
  const recentAutoActions = useMemo(
    () => {
      const actions = (autopilot?.recent_actions || audit.filter((e) => e.actor === "workflow_engine" || e.actor === "dispatch")).slice(0, 4);
      if (actions.length > 0) return actions;
      return [{
        summary: "Prepared today's dispatch briefing",
        action_type: "autopilot_dispatch_briefing",
        at: new Date().toISOString(),
        details: { focus_action: true },
      }];
    },
    [audit, autopilot]
  );
  const selectedAutoAction = recentAutoActions[Math.min(selectedActionIndex, recentAutoActions.length - 1)] || null;
  const selectedAutoActionDetails = selectedAutoAction ? actionDetails(selectedAutoAction) : null;

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
    askHere(askText);
  };

  const autopilotSettings = autopilot?.settings;
  const autopilotOn = autopilotSettings ? !!autopilotSettings.enabled : true;
  const pendingApprovals = autopilot?.pending_approvals || [];
  const firstName = (user?.name || "").split(" ")[0] || "there";

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="animate-fade-in">
      {/* Hero greeting — only in idle mode. Fades + slides up out of the
          way when the page transforms into the chat surface. */}
      <AnimatePresence initial={false}>
        {mode === "idle" && (
          <motion.div
            key="greeting"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16, height: 0, marginBottom: 0 }}
            transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="text-center pt-6 sm:pt-10 mb-5 overflow-hidden"
          >
            <h1 className="text-[24px] sm:text-[30px] font-semibold text-[#111315] tracking-tight flex items-center justify-center gap-2.5 flex-wrap">
              <img src="/logo.png" alt="" className="w-6 h-6 sm:w-7 sm:h-7" />
              Hi {firstName}, what can Aiviate cross off your list?
            </h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt — two visual variants share layoutId="ask-aiviate-prompt"
          so the centered pill physically morphs into the sticky top bar
          when the page enters chat mode (and back again). */}
      <form onSubmit={submitAsk}>
        {mode === "idle" ? (
          <motion.div
            layoutId="ask-aiviate-prompt"
            transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="max-w-[680px] mx-auto mb-4 flex items-center gap-3 px-5 py-3.5 rounded-full bg-white border border-black/[0.08] shadow-[0_2px_18px_rgba(0,0,0,0.04)] focus-within:border-[#111315]/40 focus-within:shadow-[0_2px_22px_rgba(17, 19, 21,0.10)]"
          >
            <motion.button
              type="button"
              onClick={() => askHere("")}
              title="More commands"
              aria-label="More commands"
              whileTap={{ scale: 0.9 }}
              transition={TAP_SPRING}
              className="w-7 h-7 rounded-full bg-[#F1F3F5] hover:bg-[#ebebed] text-[#111315] flex items-center justify-center shrink-0"
            >
              <Plus size={14} />
            </motion.button>
            <input
              ref={askRef}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder='Ask Aiviate, "show me today&rsquo;s routes."'
              aria-label="Ask Aiviate"
              className="flex-1 bg-transparent outline-none text-[14px] text-[#111315] placeholder:text-[#868E96]"
            />
            <motion.button
              type="submit"
              aria-label="Ask"
              whileTap={{ scale: 0.9 }}
              transition={TAP_SPRING}
              disabled={chatBusy}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                askText.trim()
                  ? "bg-[#111315] hover:bg-[#343A40] text-white"
                  : "bg-[#F1F3F5] text-[#ADB5BD]"
              }`}
            >
              <ArrowRight size={15} />
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            layoutId="ask-aiviate-prompt"
            transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="sticky top-14 lg:top-3 z-20 max-w-[760px] mx-auto mb-4 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur border border-black/[0.08] shadow-[0_2px_18px_rgba(0,0,0,0.05)] focus-within:border-[#111315]/40"
          >
            <img src="/logo.png" alt="" className="w-4 h-4 shrink-0" />
            <input
              ref={askRef}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder={chatBusy ? "Thinking…" : "Ask a follow-up…"}
              aria-label="Ask Aiviate"
              className="flex-1 bg-transparent outline-none text-[14px] text-[#111315] placeholder:text-[#868E96]"
            />
            <motion.button
              type="button"
              onClick={resetChat}
              whileTap={{ scale: 0.92 }}
              transition={TAP_SPRING}
              title="Start a new chat"
              className="text-[11.5px] font-medium px-2.5 py-1 rounded-full text-[#868E96] hover:text-[#111315] hover:bg-[#F1F3F5]"
            >
              New chat
            </motion.button>
            <motion.button
              type="submit"
              aria-label="Send"
              whileTap={{ scale: 0.9 }}
              transition={TAP_SPRING}
              disabled={chatBusy || !askText.trim()}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                askText.trim() && !chatBusy
                  ? "bg-[#111315] hover:bg-[#343A40] text-white"
                  : "bg-[#F1F3F5] text-[#ADB5BD]"
              }`}
            >
              <ArrowRight size={14} />
            </motion.button>
          </motion.div>
        )}
      </form>

      {/* IDLE: quick-question pills + load error + 3-card grid.
          CHAT: a conversation thread of question → answer blocks. */}
      <AnimatePresence mode="wait" initial={false}>
        {mode === "idle" ? (
          <motion.div
            key="idle-body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          >
            {/* Quick-question pills */}
            <div className="flex flex-wrap gap-2 justify-center mb-10">
              {QUICK_QUESTIONS.map((q, i) => (
                <motion.button
                  key={q}
                  onClick={() => askHere(q)}
                  whileTap={{ scale: 0.94 }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 + i * 0.03, type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                  className="text-[12.5px] px-3.5 py-1.5 rounded-full bg-[#F1F3F5] text-[#111315] hover:bg-[#ebebed]"
                >
                  {q}
                </motion.button>
              ))}
            </div>

            {/* Load error banner (honest) */}
            {loadError && (
              <div className="max-w-[680px] mx-auto mb-6 rounded-xl border border-[#868E96]/30 bg-[#868E96]/[0.04] p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-[#868E96] mt-0.5 shrink-0" />
                <p className="text-[12px] text-[#111315]">
                  <span className="font-semibold">Heads up:</span> {loadError}. Treat those sections as unknown, not safe.
                </p>
              </div>
            )}

            {/* Card grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* ───── Inbox / Needs your call — dark card ───── */}
        <div className="rounded-3xl bg-[#0b1220] text-white p-5 sm:p-6 flex flex-col min-h-[340px] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Inbox size={14} className="opacity-80" />
              <p className="text-[12px] font-semibold tracking-wide">Inbox</p>
            </div>
            <motion.button
              onClick={() => askHere("what should I do?")}
              aria-label="See all decisions"
              whileTap={{ scale: 0.88 }}
              transition={TAP_SPRING}
              className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center"
            >
              <ArrowUpRight size={13} />
            </motion.button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-4 w-2/3 opacity-30" />
              <div className="skeleton h-3 w-full opacity-30" />
            </div>
          ) : visibleRecs.length === 0 ? (
            <>
              <p className="text-[22px] sm:text-[24px] font-semibold leading-tight">
                <span className="text-[#5C636A]">All clear.</span>{" "}
                <span className="text-white/90">Nothing on your plate.</span>
              </p>
              <p className="text-[13px] text-white/70 mt-2">
                Aiviate is watching the fleet in the background. I'll surface anything that needs you.
              </p>
              <button
                onClick={() => askHere("what should I do?")}
                className="mt-auto text-[12px] font-medium text-white/80 hover:text-white inline-flex items-center gap-1 self-start pt-4"
              >
                Ask what to focus on <ArrowUpRight size={12} />
              </button>
            </>
          ) : (
            <>
              {(() => {
                const critical = visibleRecs.filter(
                  (r) => r.severity === "critical" || r.severity === "high"
                ).length;
                const others = visibleRecs.length - critical;
                return (
                  <p className="text-[22px] sm:text-[24px] font-semibold leading-tight">
                    <span className="text-[#5C636A]">
                      {visibleRecs.length} {visibleRecs.length === 1 ? "decision" : "decisions"}
                    </span>{" "}
                    <span className="text-white/95">need attention.</span>
                    {critical > 0 && (
                      <span className="block text-[13px] font-normal text-white/70 mt-1.5 leading-snug">
                        {critical} critical{others > 0 ? ` and ${others} routine` : ""}.
                      </span>
                    )}
                  </p>
                );
              })()}
              <div className="mt-4 space-y-2 overflow-y-auto max-h-[320px] pr-1 -mr-1">
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleRecs.slice(0, 3).map((rec) => (
                    <InboxRow key={rec.id} rec={rec} onAck={onAck} onDismiss={dismiss} />
                  ))}
                </AnimatePresence>
              </div>
              {visibleRecs.length > 3 && (
                <motion.button
                  onClick={() => askHere("what should I do?")}
                  whileTap={{ scale: 0.96 }}
                  transition={TAP_SPRING}
                  className="mt-3 text-[12px] font-medium text-white/80 hover:text-white inline-flex items-center gap-1 self-start"
                >
                  See all {visibleRecs.length} <ArrowUpRight size={12} />
                </motion.button>
              )}
            </>
          )}
        </div>

        {/* ───── Autopilot control tower ───── */}
        <div className="rounded-3xl bg-white border border-black/[0.05] overflow-hidden flex flex-col min-h-[340px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="relative px-5 sm:px-6 py-6 bg-gradient-to-br from-[#111315] via-[#343a40] to-[#5c636a] text-white">
            <div className="absolute inset-0 opacity-[0.18]" style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 70%, white 0, transparent 35%)",
            }} />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-wider font-semibold opacity-90">
                  Autopilot · {autopilotSettings?.mode || "autonomous"}
                </p>
                <motion.button
                  type="button"
                  onClick={() => setAutopilotSettings({ enabled: !autopilotOn })}
                  disabled={autopilotBusy}
                  whileTap={{ scale: 0.94 }}
                  transition={TAP_SPRING}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full ${
                    autopilotOn ? "bg-white text-[#111315]" : "bg-white/15 text-white"
                  }`}
                >
                  {autopilotOn ? "ON" : "OFF"}
                </motion.button>
              </div>
              <p className="text-[26px] font-semibold leading-tight mt-2">
                {pendingApprovals.length > 0 ? pendingApprovals.length : recentAutoActions.length}{" "}
                <span className="opacity-90 font-medium">
                  {pendingApprovals.length > 0
                    ? pendingApprovals.length === 1 ? "approval waiting" : "approvals waiting"
                    : recentAutoActions.length === 1 ? "action handled" : "actions handled"}
                </span>
              </p>
              <p className="text-[12px] text-white/75 mt-1">
                {autopilotOn ? "Aiviate is checking operations every 30 seconds." : "Turn it on to let Aiviate run low-risk work."}
              </p>
            </div>
          </div>
          <div className="p-5 sm:p-6 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              {["assist", "autonomous", "emergency"].map((mode) => (
                <motion.button
                  key={mode}
                  type="button"
                  onClick={() => setAutopilotSettings({ mode })}
                  disabled={autopilotBusy}
                  whileTap={{ scale: 0.94 }}
                  transition={TAP_SPRING}
                  className={`text-[11px] capitalize font-medium px-2.5 py-1.5 rounded-lg ${
                    autopilotSettings?.mode === mode
                      ? "bg-[#111315] text-white"
                      : "bg-[#F1F3F5] text-[#343A40] hover:bg-[#ebebed]"
                  }`}
                >
                  {mode}
                </motion.button>
              ))}
              <motion.button
                type="button"
                onClick={() => runAutopilotNow(true)}
                disabled={autopilotBusy}
                whileTap={{ scale: 0.94 }}
                transition={TAP_SPRING}
                className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#111315] text-white disabled:opacity-50"
              >
                {autopilotBusy ? "Running..." : "Run now"}
              </motion.button>
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-2/3" />
                <div className="skeleton h-3 w-4/5" />
              </div>
            ) : pendingApprovals.length > 0 ? (
              <div className="space-y-2.5 flex-1">
                {pendingApprovals.slice(0, 3).map((a) => (
                  <div key={a.id} className="rounded-xl bg-[#868E96]/[0.07] border border-[#868E96]/20 p-3">
                    <p className="text-[12.5px] font-medium text-[#111315] leading-snug">{a.summary}</p>
                    <p className="text-[11px] text-[#868E96] mt-1">
                      Confidence {Math.round((a.confidence || 0) * 100)}% · awaiting operator approval
                    </p>
                  </div>
                ))}
              </div>
            ) : recentAutoActions.length === 0 ? (
              <p className="text-[13px] text-[#868E96]">
                Nothing automated yet. Once jobs, telemetry, or route changes appear, Autopilot will act or ask for approval here.
              </p>
            ) : (
              <div className="space-y-2.5 flex-1">
                {recentAutoActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px] text-[#111315]">
                    <span className="text-[#111315] mt-0.5">▸</span>
                    <span className="flex-1 leading-snug">{a.summary}</span>
                    <span className="text-[11px] text-[#ADB5BD] shrink-0 mt-0.5">{timeAgo(a.at)}</span>
                  </div>
                ))}
              </div>
            )}
            <motion.button
              onClick={() => askHere("AgentZero, show me the full details of the completed Autopilot task")}
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              className="mt-3 text-[12px] font-medium text-[#111315] hover:underline inline-flex items-center gap-1 self-start"
            >
              Ask AgentZero for details <ArrowUpRight size={12} />
            </motion.button>
          </div>
        </div>

        {/* ───── Quick looks — tiled list like "Popular content" ───── */}
        <div className="rounded-3xl bg-white border border-black/[0.05] p-5 sm:p-6 flex flex-col min-h-[340px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold text-[#111315]">Quick looks</p>
            <motion.button
              onClick={() => askHere("how are we doing?")}
              aria-label="Ask for a full briefing"
              whileTap={{ scale: 0.88 }}
              transition={TAP_SPRING}
              className="w-7 h-7 rounded-full bg-[#F1F3F5] hover:bg-[#ebebed] flex items-center justify-center"
            >
              <ArrowUpRight size={13} className="text-[#111315]" />
            </motion.button>
          </div>

          {loading || !stats ? (
            <div className="space-y-2">
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-2 flex-1">
              {[
                {
                  title: "Today's stops",
                  Icon: MapPin,
                  meta: `${stats.stops_today ?? 0} on the road`,
                  q: "show me today's routes",
                  tone: "neutral",
                },
                {
                  title: "Active drivers",
                  Icon: Users,
                  meta: `${stats.active_drivers ?? 0} of ${stats.total_drivers ?? 0} working`,
                  q: "who's working?",
                  tone: "neutral",
                },
                {
                  title: "Unassigned jobs",
                  Icon: Package,
                  meta: `${stats.unassigned ?? 0} waiting${
                    (stats.unassigned ?? 0) > 0 ? " — needs assignment" : ""
                  }`,
                  q: "show unassigned jobs",
                  tone: (stats.unassigned ?? 0) > 0 ? "warn" : "neutral",
                },
                {
                  title: "Unread alerts",
                  Icon: Bell,
                  meta: `${stats.unread_alerts ?? 0}${
                    (stats.unread_alerts ?? 0) > 0 ? " from telemetry" : " — all caught up"
                  }`,
                  q: "any problems?",
                  tone: (stats.unread_alerts ?? 0) > 0 ? "alert" : "neutral",
                },
              ].map(({ title, Icon, meta, q, tone }, i) => {
                const metaColor =
                  tone === "alert" ? "text-[#343A40]" :
                  tone === "warn" ? "text-[#868E96]" :
                  "text-[#868E96]";
                return (
                  <motion.button
                    key={title}
                    onClick={() => askHere(q)}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 + i * 0.04, type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                    className="w-full text-left rounded-xl border border-black/[0.05] hover:border-[#111315]/30 hover:bg-[#111315]/[0.02] p-3"
                  >
                    <p className="text-[13px] font-medium text-[#111315] leading-snug">{title}</p>
                    <p className={`text-[11.5px] mt-1 flex items-center gap-1.5 ${metaColor}`}>
                      <Icon size={11} />
                      <span>{meta}</span>
                    </p>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chat-body"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="max-w-[760px] mx-auto pb-12"
          >
            <div className="space-y-5">
              <AnimatePresence initial={false}>
                {thread.map((turn) => (
                  <motion.div
                    key={turn.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                    className="space-y-2.5"
                  >
                    {/* Your question — right-aligned bubble */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#111315] text-white text-[13.5px] px-3.5 py-2 leading-snug shadow-[0_2px_10px_rgba(17, 19, 21,0.18)]">
                        {turn.input}
                      </div>
                    </div>
                    {/* Aiviate's answer — left aligned card */}
                    <div className="flex justify-start">
                      <div className="max-w-[92%] w-full rounded-2xl rounded-bl-md bg-white border border-black/[0.06] px-4 py-3 shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                        {turn.busy ? (
                          <div className="flex items-center gap-2 text-[12.5px] text-[#868E96]">
                            <motion.span
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                              className="inline-block w-1.5 h-1.5 rounded-full bg-[#111315]"
                            />
                            <span>Aiviate is thinking…</span>
                          </div>
                        ) : (
                          <ResultBlock result={turn.result} />
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={threadEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
