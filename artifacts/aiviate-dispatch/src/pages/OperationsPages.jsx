import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Cable,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Headphones,
  Mail,
  Map,
  Mic,
  MicOff,
  Package,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  UserCheck,
  Users,
  Volume2,
  X,
} from "lucide-react";
import {
  getActivity,
  getApprovals,
  getDrivers,
  getExceptions,
  getJobs,
  getOperationsSnapshot,
  getPolicies,
  getStoreOrders,
  runNewOrderWorkflow,
  sendCommand,
  updatePolicies,
} from "../services/api";
import ResultBlock from "../components/ResultBlock";
import { takePendingAsk } from "../lib/askBus";
import {
  getChatHistoryItem,
  takeQueuedChatOpen,
  titleFromThread,
  upsertChatHistory,
} from "../lib/chatHistory";
import {
  siGmail,
  siQuickbooks,
  siSage,
  siWhatsapp,
  siXero,
  siZoho,
} from "simple-icons";

const ICONS = {
  operations: Bot,
  orders: Package,
  planning: ClipboardCheck,
  live: Activity,
  exceptions: AlertTriangle,
  approvals: ShieldCheck,
  routes: Route,
  drivers: UserCheck,
  vehicles: Truck,
  customers: Users,
  communications: Mail,
  activity: Activity,
  intelligence: Map,
  policies: ShieldCheck,
};

const DEFAULT_AGENT_PREFS = {
  assistant_name: "Aiviate",
  voice_mode: true,
  speak_replies: true,
};

function readAgentPrefs() {
  try {
    return {
      ...DEFAULT_AGENT_PREFS,
      ...JSON.parse(localStorage.getItem("aiviate_agent_preferences") || "{}"),
    };
  } catch {
    return DEFAULT_AGENT_PREFS;
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function time(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function BrandIcon({ icon, size = 16 }) {
  return (
    <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`} xmlns="http://www.w3.org/2000/svg">
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  );
}

function PageHeader({ title, body, icon }) {
  const Icon = ICONS[icon] || Bot;
  return (
    <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg bg-[#F1F3F5] text-[#111315] flex items-center justify-center">
            <Icon size={17} strokeWidth={1.8} />
          </span>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">{title}</h1>
        </div>
        <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-2 max-w-2xl">{body}</p>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }) {
  const tones = {
    neutral: "bg-white border-[#E9ECEF]",
    good: "bg-[#F8F9FA] border-[#DEE2E6]",
    warn: "bg-[#F8F9FA] border-[#DEE2E6]",
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.neutral}`}>
      <p className="text-[12px] text-[#868E96]">{label}</p>
      <p className="text-[24px] font-semibold text-[#111315] tabular-nums mt-1">{value}</p>
    </div>
  );
}

function ActivityList({ entries = [] }) {
  if (!entries.length) {
    return <p className="text-[13px] text-[#868E96]">No activity has been recorded for this tenant yet.</p>;
  }
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-[#E9ECEF] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-[#111315]">{entry.summary}</p>
            <span className="text-[11px] text-[#ADB5BD] whitespace-nowrap">{time(entry.created_at)}</span>
          </div>
          <p className="text-[11px] text-[#868E96] mt-1">
            {entry.actor || "system"} · {entry.action_type || "activity"}
            {entry.requires_approval ? " · approval required" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
    </div>
  );
}

function resultSpeechText(result) {
  if (!result) return "";
  return result.summary || (result.ok ? "Done." : "Aiviate could not answer that yet.");
}

function TypewriterResult({ result, onDone }) {
  const [visible, setVisible] = useState("");
  const [done, setDone] = useState(false);
  const text = resultSpeechText(result);

  useEffect(() => {
    setVisible("");
    setDone(false);
    let index = 0;
    const id = window.setInterval(() => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(id);
        setDone(true);
        onDone?.(result);
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [text, result, onDone]);

  const hasDetails = result?.ok && result?.type && !["greeting", "llm"].includes(result.type);

  return (
    <div className="space-y-3">
      <p className={`text-[15px] leading-[1.68] ${result?.ok === false ? "text-[#343A40]" : "text-[#111315]"}`}>
        {visible}
        {!done && <span className="ml-0.5 inline-block h-4 w-[1.5px] translate-y-0.5 animate-pulse bg-[#111315]" />}
      </p>
      {done && hasDetails && (
        <div className="animate-fade-in border-t border-[#E9ECEF] pt-3">
          <ResultBlock result={result} />
        </div>
      )}
    </div>
  );
}

function ChatTurn({ turn, onTyped, assistantName }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-[#111315] px-4 py-3 text-[15px] leading-[1.58] text-white">
          {turn.input}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <img src="/logo.png" alt="" className="mt-1 h-7 w-7 shrink-0 object-contain" />
        <div className="min-w-0 flex-1 px-1 py-1">
          {turn.busy ? (
            <div className="flex items-center gap-2 text-[13px] text-[#868E96]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#111315]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5C636A] [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ADB5BD] [animation-delay:240ms]" />
              <span className="ml-1">{assistantName} is checking the operation</span>
            </div>
          ) : (
            <TypewriterResult result={turn.result} onDone={onTyped} />
          )}
        </div>
      </div>
    </div>
  );
}

const CHAT_CONNECTORS = [
  { name: "Gmail", detail: "Email orders and support", brand: siGmail },
  { name: "WhatsApp", detail: "Customer messages", brand: siWhatsapp },
  { name: "Teams", detail: "Ops team alerts", Icon: Users, tone: "#6264A7" },
  { name: "QuickBooks", detail: "Invoices and payments", brand: siQuickbooks },
  { name: "Xero", detail: "Accounting sync", brand: siXero },
  { name: "Sage", detail: "Accounting sync", brand: siSage },
  { name: "Zoho", detail: "Accounting and CRM", brand: siZoho },
  { name: "Olyxee Logistics", detail: "Fleet operations", logo: "/logo.png" },
];

function ConnectorIcon({ connector, size = 16 }) {
  if (connector.brand) return <BrandIcon icon={connector.brand} size={size} />;
  if (connector.logo) return <img src={connector.logo} alt="" className="h-4 w-4 object-contain" />;
  const Icon = connector.Icon || Cable;
  return <Icon size={size} strokeWidth={1.75} style={{ color: connector.tone || "#111315" }} />;
}

function ConnectorPicker({ compact = false }) {
  const [open, setOpen] = useState(false);
  const openIntegrations = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("aiviate:open-panel", { detail: { panel: "integrations" } }));
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-xl bg-[#F1F3F5] px-2.5 py-1.5 text-[12px] font-medium text-[#343A40] transition-colors hover:bg-[#E9ECEF] hover:text-[#111315]"
        aria-expanded={open}
      >
        <Cable size={14} strokeWidth={1.7} />
        Tools
        <ChevronDown size={13} strokeWidth={1.7} />
      </button>
      {open && (
        <div className={`chat-tool-menu absolute bottom-full left-0 z-30 mb-2 w-[min(420px,calc(100vw-48px))] rounded-2xl border border-black/[0.08] bg-white p-3 shadow-[0_18px_55px_rgba(17,19,21,0.16)] ${compact ? "sm:left-auto sm:right-0" : ""}`}>
          <div className="mb-2 px-1">
            <p className="text-[13px] font-semibold text-[#111315]">Connect tools</p>
            <p className="text-[11.5px] leading-[1.45] text-[#868E96]">Use real business systems for orders, messages, alerts and finance context.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CHAT_CONNECTORS.map((connector) => (
              <button
                type="button"
                key={connector.name}
                onClick={openIntegrations}
              className="chat-tool-item flex items-center gap-2 rounded-xl border border-[#E9ECEF] bg-[#F8F9FA] px-2.5 py-2 text-left transition-colors hover:border-[#ADB5BD] hover:bg-white"
              >
                <span className="chat-tool-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(17,19,21,0.04)]">
                  <ConnectorIcon connector={connector} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-[#111315]">{connector.name}</span>
                  <span className="block truncate text-[10.5px] text-[#868E96]">{connector.detail}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openIntegrations}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#111315] px-3 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#343A40]"
          >
            Manage integrations
          </button>
        </div>
      )}
    </div>
  );
}

function PromptToolChips() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <ConnectorPicker />
      {CHAT_CONNECTORS.slice(0, 5).map((connector) => (
        <button
          key={connector.name}
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("aiviate:open-panel", { detail: { panel: "integrations" } }))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E9ECEF] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#343A40] transition-colors hover:border-[#ADB5BD] hover:text-[#111315]"
        >
          <ConnectorIcon connector={connector} size={14} />
          {connector.name}
        </button>
      ))}
    </div>
  );
}

function EmptyChatState({ onPrompt, onVoice, assistantName, voiceEnabled }) {
  const prompts = [
    { title: "What jobs are available?", detail: "Use only real storefront work" },
    { title: "Where did this order come from?", detail: "Explain the data source" },
    { title: "What should I do next?", detail: "Give an operator summary" },
  ];
  return (
    <div className="mx-auto flex min-h-[58vh] max-w-[760px] flex-col items-center justify-center text-center">
      <img src="/logo.png" alt="" className="mb-5 h-14 w-14 object-contain" />
      <h1 className="text-[32px] font-semibold tracking-tight text-[#111315] sm:text-[44px]">
        How can I help?
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-[1.65] text-[#5C636A]">
        Ask {assistantName} anything about orders, drivers, jobs, or what is happening in the operation.
      </p>
      {voiceEnabled && (
        <button
          onClick={onVoice}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#DEE2E6] bg-white px-4 py-2.5 text-[13px] font-medium text-[#111315] transition-colors hover:bg-[#F8F9FA]"
        >
          <Headphones size={16} strokeWidth={1.6} />
          Voice
        </button>
      )}
      <div className="mt-8 grid w-full gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.title}
            onClick={() => onPrompt(prompt.title)}
            className="chat-suggestion-card group rounded-2xl border border-[#E9ECEF] bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(17,19,21,0.03)] transition-colors hover:border-[#ADB5BD] hover:bg-[#F8F9FA]"
          >
            <span className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#111315]">
              {prompt.title}
              <Sparkles size={14} strokeWidth={1.55} className="text-[#ADB5BD] transition-colors group-hover:text-[#5C636A]" />
            </span>
            <span className="block pt-1 text-[11px] text-[#868E96]">{prompt.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatComposer({ value, onChange, onSubmit, busy, inputRef, onVoice, assistantName, voiceEnabled }) {
  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-[820px]">
      <div className="chat-composer rounded-[22px] border border-[#DEE2E6] bg-white p-2 shadow-[0_8px_28px_rgba(17,19,21,0.08)] focus-within:border-[#111315]/50">
        <div className="flex items-end gap-2">
          {voiceEnabled && (
            <button
              type="button"
              onClick={onVoice}
              className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#111315] transition-colors hover:bg-[#E9ECEF]"
              aria-label="Start voice mode"
              title="Voice mode"
            >
              <Mic size={16} strokeWidth={1.6} />
            </button>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder={`Message ${assistantName}...`}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-[15px] leading-[1.45] text-[#111315] outline-none placeholder:text-[#ADB5BD]"
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#111315] text-white transition-colors hover:bg-[#343A40] disabled:bg-[#E9ECEF] disabled:text-[#ADB5BD]"
            aria-label="Send"
          >
            <ArrowUpRight size={16} strokeWidth={1.6} />
          </button>
        </div>
        <div className="flex items-center px-3 pb-1">
          <ConnectorPicker compact />
        </div>
      </div>
    </form>
  );
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function VoiceMode({ open, onClose, onTranscript, speaking, assistantName, speakReplies }) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const SpeechRecognition = getSpeechRecognition();
    setSupported(Boolean(SpeechRecognition));
    return () => {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setListening(false);
    };
  }, [open]);

  const start = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-ZA";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
      const last = event.results[event.results.length - 1];
      if (last?.isFinal && text.trim()) {
        onTranscript(text.trim());
        setTranscript("");
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stop = () => recognitionRef.current?.stop?.();

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[28px] border border-white/60 bg-white p-5 shadow-[0_28px_80px_rgba(17,19,21,0.24)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[#111315]">Voice mode</p>
            <p className="text-[12px] text-[#868E96]">Talk to {assistantName} about your business</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3F5] text-[#5C636A] hover:bg-[#E9ECEF]"
            aria-label="Close voice mode"
          >
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>

        <div className="py-8 text-center">
          <button
            onClick={listening ? stop : start}
            disabled={!supported}
            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full border shadow-[0_18px_55px_rgba(17,19,21,0.14)] transition-transform active:scale-[0.98] ${
              listening ? "animate-ring-pulse border-[#111315] bg-[#111315] text-white" : "border-[#E9ECEF] bg-[#F8F9FA] text-[#111315]"
            }`}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <MicOff size={30} strokeWidth={1.5} /> : <Mic size={30} strokeWidth={1.5} />}
          </button>

          <div className="mt-6 flex items-end justify-center gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`voice-bar h-4 w-1.5 rounded-full ${listening ? "bg-[#111315]" : "bg-[#DEE2E6]"}`}
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>

          <p className="mt-5 min-h-10 text-[14px] leading-relaxed text-[#343A40]">
            {!supported
              ? `Voice recognition is not available in this browser. You can still type to ${assistantName}.`
              : transcript || (speaking ? `${assistantName} is speaking...` : listening ? "Listening..." : "Tap the microphone and speak.")}
          </p>
        </div>

        <div className="rounded-2xl bg-[#F8F9FA] px-4 py-3">
          <div className="flex items-start gap-2 text-[12px] text-[#5C636A]">
            <Volume2 size={14} strokeWidth={1.6} className="mt-0.5 shrink-0" />
            {speakReplies
              ? `${assistantName} will read the response aloud when your browser supports speech.`
              : "Read-aloud replies are turned off in Settings."}
          </div>
        </div>
      </div>
    </div>
  );
}

function Surface({ title, action, children }) {
  return (
    <section className="rounded-xl border border-[#E6EAED] bg-white p-4 shadow-[0_1px_2px_rgba(17,19,21,0.03)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-[#111315]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ModuleLink({ to, label, detail, icon: Icon, tone = "neutral" }) {
  const tones = {
    neutral: "border-[#E9ECEF] hover:border-[#C8D1D6]",
    warn: "border-[#DEE2E6] bg-[#F8F9FA] hover:border-[#ADB5BD]",
    good: "border-[#DEE2E6] bg-[#F8F9FA] hover:border-[#ADB5BD]",
  };
  return (
    <Link to={to} className={`rounded-lg border p-3 transition-colors ${tones[tone] || tones.neutral}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} strokeWidth={1.8} className={tone === "warn" ? "text-[#5C636A]" : "text-[#111315]"} />
        <p className="text-[13px] font-semibold text-[#111315]">{label}</p>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-[#5C636A]">{detail}</p>
    </Link>
  );
}

function useAsync(loader, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    loader()
      .then((data) => alive && setState({ loading: false, data, error: "" }))
      .catch((err) => alive && setState({ loading: false, data: null, error: err?.message || "Failed to load" }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function OperationsCommand() {
  const [askText, setAskText] = useState("");
  const [thread, setThread] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [agentPrefs, setAgentPrefs] = useState(readAgentPrefs);
  const voiceReplyRef = useRef(null);
  const askRef = useRef(null);
  const endRef = useRef(null);

  const speak = useCallback((text) => {
    if (!agentPrefs.speak_replies || !text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.95;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [agentPrefs.speak_replies]);

  const askHere = useCallback(async (raw, options = {}) => {
    const text = (raw || "").trim();
    if (!text) {
      askRef.current?.focus();
      return;
    }
    setAskText("");
    const currentConversationId = conversationId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!conversationId) setConversationId(currentConversationId);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (options.voice && agentPrefs.speak_replies) voiceReplyRef.current = id;
    setThread((items) => [...items, { id, input: text, busy: true, result: null }]);
    setChatBusy(true);
    try {
      const result = await sendCommand(text);
      setThread((items) => items.map((item) => item.id === id ? { ...item, busy: false, result } : item));
    } catch (e) {
      setThread((items) => items.map((item) => item.id === id
        ? { ...item, busy: false, result: { ok: false, summary: e?.message || "Aiviate could not answer that yet." } }
        : item));
    } finally {
      setChatBusy(false);
    }
  }, [agentPrefs.speak_replies, conversationId]);

  const handleTyped = useCallback((turn, result) => {
    if (voiceReplyRef.current !== turn.id) return;
    voiceReplyRef.current = null;
    speak(resultSpeechText(result));
  }, [speak]);

  useEffect(() => {
    const onHomeAsk = (e) => askHere(e?.detail?.text || "");
    window.addEventListener("home:ask", onHomeAsk);
    return () => window.removeEventListener("home:ask", onHomeAsk);
  }, [askHere]);

  useEffect(() => {
    const pending = takePendingAsk();
    if (pending !== null) askHere(pending);
  }, [askHere]);

  useEffect(() => {
    const openConversation = (id) => {
      const saved = getChatHistoryItem(id);
      if (!saved) return;
      setConversationId(saved.id);
      setThread(saved.thread || []);
    };
    const queued = takeQueuedChatOpen();
    if (queued) openConversation(queued);
    const onOpenChat = (e) => openConversation(e?.detail?.id);
    const onNewChat = () => {
      setConversationId(null);
      setThread([]);
      setAskText("");
      voiceReplyRef.current = null;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
    window.addEventListener("aiviate:open-chat", onOpenChat);
    window.addEventListener("aiviate:new-chat", onNewChat);
    return () => {
      window.removeEventListener("aiviate:open-chat", onOpenChat);
      window.removeEventListener("aiviate:new-chat", onNewChat);
    };
  }, []);

  useEffect(() => {
    const completedThread = thread.filter((turn) => turn.input && !turn.busy && turn.result);
    if (!conversationId || !completedThread.length) return;
    upsertChatHistory({
      id: conversationId,
      title: titleFromThread(completedThread),
      thread: completedThread,
      updated_at: new Date().toISOString(),
    });
  }, [conversationId, thread]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "aiviate_agent_preferences") setAgentPrefs(readAgentPrefs());
    };
    const onAgentPrefs = (e) => setAgentPrefs({ ...DEFAULT_AGENT_PREFS, ...(e.detail || {}) });
    window.addEventListener("storage", onStorage);
    window.addEventListener("aiviate:agent-preferences", onAgentPrefs);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("aiviate:agent-preferences", onAgentPrefs);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const submitAsk = (e) => {
    e?.preventDefault?.();
    askHere(askText);
  };

  return (
    <div className="chat-shell animate-fade-in -mx-5 -mt-14 flex min-h-[calc(100vh-1rem)] flex-col bg-[#F8F9FA] sm:-mx-8 lg:-mx-12 lg:-mt-8">
      <div className="flex-1 overflow-y-auto px-5 pt-16 sm:px-8 lg:px-12 lg:pt-10">
        {thread.length === 0 ? (
          <EmptyChatState
            onPrompt={askHere}
            onVoice={() => setVoiceOpen(true)}
            assistantName={agentPrefs.assistant_name || "Aiviate"}
            voiceEnabled={agentPrefs.voice_mode}
          />
        ) : (
          <div className="mx-auto max-w-[820px] space-y-8 pb-8">
            {thread.map((turn) => (
              <ChatTurn
                key={turn.id}
                turn={turn}
                assistantName={agentPrefs.assistant_name || "Aiviate"}
                onTyped={(result) => handleTyped(turn, result)}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="chat-composer-dock z-20 bg-[#F8F9FA]/95 px-5 pb-4 pt-3 backdrop-blur sm:px-8 lg:px-12">
        <ChatComposer
          value={askText}
          onChange={setAskText}
          onSubmit={submitAsk}
          busy={chatBusy}
          inputRef={askRef}
          onVoice={() => setVoiceOpen(true)}
          assistantName={agentPrefs.assistant_name || "Aiviate"}
          voiceEnabled={agentPrefs.voice_mode}
        />
      </div>
      <VoiceMode
        open={voiceOpen && agentPrefs.voice_mode}
        onClose={() => setVoiceOpen(false)}
        onTranscript={(text) => askHere(text, { voice: true })}
        speaking={speaking}
        assistantName={agentPrefs.assistant_name || "Aiviate"}
        speakReplies={agentPrefs.speak_replies}
      />
    </div>
  );
}

export function Planning() {
  const state = useAsync(async () => {
    const [snapshot, jobs, orders] = await Promise.all([getOperationsSnapshot(), getJobs(), getStoreOrders()]);
    return { snapshot, jobs: jobs.jobs || [], orders: orders.orders || [] };
  }, []);
  const status = state.data?.snapshot?.operational_status || {};
  const unplanned = (state.data?.orders || []).filter((o) => !o.job_id && String(o.id || "").startsWith("STORE-"));
  return (
    <div className="animate-fade-in">
      <PageHeader title="Planning" icon="planning" body="Prepare the operation from storefront demand, current route jobs, available drivers, and autonomy policies." />
      {state.loading ? <LoadingPanel /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Metric label="Unplanned orders" value={fmt(unplanned.length || status.pending)} tone={(unplanned.length || status.pending) ? "warn" : "good"} />
            <Metric label="Route jobs" value={fmt(state.data?.jobs.length)} />
            <Metric label="Available drivers" value={fmt(status.drivers_available)} />
            <Metric label="Orders needing review" value={fmt(status.unresolved_exceptions)} />
          </div>
          <div className="rounded-xl border border-[#E9ECEF] bg-white p-4">
            <h3 className="text-[14px] font-semibold text-[#111315] mb-3">Planning queue</h3>
            <ActivityList entries={state.data?.snapshot?.recent_activity || []} />
          </div>
        </>
      )}
    </div>
  );
}

export function Exceptions() {
  const state = useAsync(getExceptions, []);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Exceptions" icon="exceptions" body="Operational disruptions raised from alerts, safety events, failed deliveries, and workflow guardrails." />
      {state.loading ? <LoadingPanel /> : (
        <div className="space-y-3">
          {(state.data?.exceptions || []).length === 0 && <div className="rounded-xl border border-[#E9ECEF] bg-[#F8F9FA] p-4 text-[13px] text-[#343A40]">No unresolved exceptions are currently raised.</div>}
          {(state.data?.exceptions || []).map((item) => (
            <div key={item.id} className="rounded-xl border border-[#E9ECEF] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-[#111315]">{item.title}</p>
                <span className="text-[11px] uppercase tracking-wide text-[#868E96]">{item.severity}</span>
              </div>
              <p className="text-[13px] text-[#5C636A] mt-1">{item.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Approvals() {
  const state = useAsync(getApprovals, []);
  const requests = useMemo(() => [...(state.data?.requests || []), ...(state.data?.alerts || [])], [state.data]);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Approvals" icon="approvals" body="Human authority queue for restricted actions such as capacity shortages, safety escalations, and major route changes." />
      {state.loading ? <LoadingPanel /> : (
        <div className="space-y-3">
          {requests.length === 0 && <div className="rounded-xl border border-[#E9ECEF] bg-[#F8F9FA] p-4 text-[13px] text-[#343A40]">No approvals are waiting right now.</div>}
          {requests.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#E9ECEF] bg-white p-4">
              <p className="text-[14px] font-semibold text-[#111315]">{item.summary || item.title}</p>
              <p className="text-[13px] text-[#5C636A] mt-1">{item.message || item.action_type || "Approval requested"}</p>
              <div className="mt-3 flex gap-2">
                <button className="rounded-lg bg-[#111315] text-white px-3 py-1.5 text-[12px] font-medium">Approve</button>
                <button className="rounded-lg bg-[#F1F3F5] text-[#111315] px-3 py-1.5 text-[12px] font-medium">Review</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiviateActivity() {
  const state = useAsync(() => getActivity(150), []);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Aiviate Activity" icon="activity" body="Append-only trail of autonomous and human-approved operational actions." />
      {state.loading ? <LoadingPanel /> : <ActivityList entries={state.data?.entries || []} />}
    </div>
  );
}

export function PoliciesAutonomy() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const load = async () => {
    try { setState({ loading: false, data: await getPolicies(), error: "" }); }
    catch (e) { setState({ loading: false, data: null, error: e?.message || "Failed to load policies" }); }
  };
  useEffect(() => { load(); }, []);
  const policies = state.data?.policies || {};
  const toggle = async (field) => {
    setState((s) => ({ ...s, loading: true }));
    await updatePolicies({ [field]: !policies[field] });
    await load();
  };
  return (
    <div className="animate-fade-in">
      <PageHeader title="Policies & Autonomy" icon="policies" body="Backend-enforced guardrails for what Aiviate can do automatically and what needs approval." />
      {state.loading ? <LoadingPanel /> : (
        <>
          {state.error && <div className="mb-4 rounded-lg border border-[#DEE2E6] bg-[#F8F9FA] p-3 text-[13px] text-[#343A40]">{state.error}</div>}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#E9ECEF] bg-white p-4">
              <p className="text-[12px] text-[#868E96]">Autonomy level</p>
              <p className="text-[32px] font-semibold text-[#111315] mt-1">{policies.autonomy_level ?? 0}</p>
              <p className="text-[13px] text-[#5C636A] mt-2 capitalize">{policies.mode || "assist"} mode</p>
            </div>
            {["enabled", "auto_assign", "auto_optimize", "auto_notify"].map((field) => (
              <button key={field} onClick={() => toggle(field)} className="rounded-xl border border-[#E9ECEF] bg-white p-4 text-left hover:border-[#111315]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-[#111315]">{field.replaceAll("_", " ")}</p>
                  {policies[field] ? <CheckCircle2 size={18} className="text-[#343A40]" /> : <AlertTriangle size={18} className="text-[#5C636A]" />}
                </div>
                <p className="text-[13px] text-[#868E96] mt-2">{policies[field] ? "Automatic where allowed" : "Manual or approval required"}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-[#E9ECEF] bg-white p-4">
            <h3 className="text-[14px] font-semibold text-[#111315] mb-3">Guardrails</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {(policies.guardrails || []).map((rule) => (
                <div key={rule} className="rounded-lg bg-[#F8F9FA] p-3 text-[13px] text-[#5C636A]">{rule}</div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Customers() {
  const state = useAsync(getStoreOrders, []);
  const customers = new Map();
  for (const order of state.data?.orders || []) {
    const key = order.customer_phone || order.customer_name || order.id;
    if (!customers.has(key)) customers.set(key, { ...order, count: 0 });
    customers.get(key).count += 1;
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="Customers" icon="customers" body="Customer delivery profiles built from real storefront stops and order history." />
      {state.loading ? <LoadingPanel /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...customers.values()].map((c) => (
            <div key={`${c.customer_name}-${c.customer_phone}`} className="rounded-xl border border-[#E9ECEF] bg-white p-4">
              <p className="text-[14px] font-semibold text-[#111315]">{c.customer_name || "Customer"}</p>
              <p className="text-[13px] text-[#5C636A] mt-1">{c.shipping_address}</p>
              <p className="text-[12px] text-[#868E96] mt-2">{c.count} delivery record(s) · {c.customer_phone || "no phone"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Communications() {
  const state = useAsync(() => getActivity(100), []);
  const comms = (state.data?.entries || []).filter((e) => /notify|notification|call|customer|driver_notified/.test(e.action_type || ""));
  return (
    <div className="animate-fade-in">
      <PageHeader title="Communications" icon="communications" body="Operational communication records across driver alerts, customer notification simulations, and future call-agent outcomes." />
      {state.loading ? <LoadingPanel /> : <ActivityList entries={comms} />}
    </div>
  );
}

export function Vehicles() {
  const state = useAsync(getDrivers, []);
  const vehicles = (state.data?.drivers || []).map((driver) => ({
    id: `${driver.id}-${driver.vehicle_type}`,
    type: driver.vehicle_type || "vehicle",
    driver: driver.name,
    status: driver.blocked ? "blocked" : driver.status || "available",
  }));
  return (
    <div className="animate-fade-in">
      <PageHeader title="Vehicles" icon="vehicles" body="Current vehicle allocation is derived from driver profiles until full vehicle records are connected." />
      {state.loading ? <LoadingPanel /> : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <div key={v.id} className="rounded-xl border border-[#E9ECEF] bg-white p-4">
              <p className="text-[14px] font-semibold text-[#111315] capitalize">{v.type}</p>
              <p className="text-[13px] text-[#5C636A] mt-1">Assigned driver: {v.driver}</p>
              <p className="text-[12px] text-[#868E96] mt-2 capitalize">{v.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Intelligence() {
  const state = useAsync(getOperationsSnapshot, []);
  const status = state.data?.operational_status || {};
  const humanInterventions = (status.pending_approvals || 0) + (status.unresolved_exceptions || 0);
  const perThousand = status.total_deliveries ? Math.round((humanInterventions / status.total_deliveries) * 1000) : 0;
  return (
    <div className="animate-fade-in">
      <PageHeader title="Intelligence" icon="intelligence" body="Operational metrics focused on reducing human interventions without degrading delivery quality or safety." />
      {state.loading ? <LoadingPanel /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Human interventions / 1,000" value={fmt(perThousand)} tone={perThousand ? "warn" : "good"} />
          <Metric label="On-time projection" value={`${status.projected_on_time_pct || 0}%`} tone="good" />
          <Metric label="Exceptions" value={fmt(status.unresolved_exceptions)} />
          <Metric label="Approvals" value={fmt(status.pending_approvals)} />
        </div>
      )}
    </div>
  );
}
