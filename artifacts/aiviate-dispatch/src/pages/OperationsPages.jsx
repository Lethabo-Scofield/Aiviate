import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Mail,
  Map,
  Mic,
  Package,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
} from "lucide-react";
import {
  getActivity,
  getApprovals,
  getDrivers,
  getExceptions,
  getJobs,
  searchGmail,
  replyGmail,
  getOperationsSnapshot,
  getPolicies,
  getStoreOrders,
  runNewOrderWorkflow,
  sendCommand,
  updatePolicies,
} from "../services/api";
import ResultBlock from "../components/ResultBlock";
import ChatActivity from "../components/ChatActivity";
import EmptyChatOverview from "../components/EmptyChatOverview";
import IntegrationTools, { PROVIDERS, useIntegrationCatalog } from "../components/IntegrationTools";
import IntegrationSlashMenu from "../components/IntegrationSlashMenu";
import VoiceMode from "../components/VoiceMode";
import { takePendingAsk } from "../lib/askBus";
import {
  getChatHistoryItem,
  takeQueuedChatOpen,
  titleFromThread,
  upsertChatHistory,
} from "../lib/chatHistory";

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

function gmailSearchQuery(text) {
  const cleaned = text.replace(/\bfrom\s+\/?gmail\b/gi, " ").replace(/\/gmail\b|\bgmail\b/gi, " ").replace(/\s+/g, " ").trim();
  if (/\b(?:unread|unopened)\b/i.test(cleaned)) return "in:inbox is:unread -label:trash";
  const from = cleaned.match(/\bfrom\s+([^\n?]+?)(?:\s+(?:and|about|with)\b|$)/i);
  if (from && !/^\s*(?:and\b|my\b|the\b|inbox\b|messages?\b|emails?\b)/i.test(from[1])) {
    return `in:inbox -label:trash from:"${from[1].trim().replace(/"/g, "")}"`;
  }
  if (/^\s*(?:in:|from:|subject:|after:|before:|label:|is:)/i.test(cleaned)) return cleaned;
  const search = cleaned.match(/\b(?:search|find|look\s+for)\b(?:\s+(?:my|the|in|for|emails?|messages?))*\s+(.+)$/i);
  if (search) return `in:inbox -label:trash ${search[1].replace(/[?]+$/, "").trim()}`;
  if (/\b(?:latest|lastest|last|recent|new|inbox|messages|massages|suppliers?|reply|respond)\b/i.test(cleaned) || !cleaned) return "in:inbox -label:trash";
  return `in:inbox -label:trash ${cleaned.replace(/[?]+$/, "")}`;
}

function resultSpeechText(result) {
  if (!result) return "";
  return result.summary || (result.ok ? "Done." : "Aiviate could not answer that yet.");
}

function ChatAnswer({ result, onReply, sending, animate = false, onProgress }) {
  const text = resultSpeechText(result);
  const characters = Array.from(text);
  const [visibleCount, setVisibleCount] = useState(() =>
    animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : characters.length
  );
  const typing = animate && visibleCount < characters.length;
  const hasDetails = result?.type === "gmail_unconnected" || (result?.ok && (result?.provider === "gmail" || (result?.type && !["greeting", "llm"].includes(result.type))));

  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleCount(characters.length);
      return;
    }
    let count = 0;
    setVisibleCount(0);
    const timer = window.setInterval(() => {
      count += 1;
      setVisibleCount(count);
      if (count >= characters.length) window.clearInterval(timer);
    }, Math.max(5, Math.min(24, 3500 / characters.length)));
    return () => window.clearInterval(timer);
  }, [animate, text]);

  useEffect(() => {
    if (visibleCount % 8 === 0 || visibleCount === characters.length) onProgress?.();
  }, [visibleCount, characters.length, onProgress]);

  return (
    <div className="space-y-3 animate-fade-in">
      <p aria-hidden={animate ? "true" : undefined} className={`whitespace-pre-wrap text-[15px] leading-[1.68] ${result?.ok === false ? "text-[#343A40]" : "text-[#111315]"}`}>
        {animate ? characters.slice(0, visibleCount).join("") : text}
        {typing && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-current motion-safe:animate-pulse" />}
      </p>
      {animate && <span className="sr-only" role="status">{text}</span>}
      {hasDetails && !typing && (
        <div className="animate-fade-in border-t border-[#E9ECEF] pt-3">
          <ResultBlock result={result} onReply={onReply} sending={sending} />
        </div>
      )}
    </div>
  );
}

function ChatTurn({ turn, assistantName, onReply, sending, onProgress }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[78%]">
          {turn.toolContext && <p className="mb-1 text-right text-[11px] font-semibold text-[#697980]">
            {turn.toolContext.name}{turn.toolContext.demo ? " · Sample preview" : ""}
          </p>}
          <div className="rounded-2xl bg-[#111315] px-4 py-3 text-[15px] leading-[1.58] text-white">{turn.input}</div>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <img src="/logo.png" alt="" className="mt-1 h-7 w-7 shrink-0 object-contain" />
        <div className="min-w-0 flex-1 px-1 py-1">
          {turn.busy ? (
            <ChatActivity activity={turn.activity || { kind: "operations", label: "Checking the request" }} assistantName={assistantName} />
          ) : (
            <div className="space-y-3">
              {turn.activity && <ChatActivity activity={turn.activity} assistantName={assistantName} result={turn.result} />}
              <ChatAnswer result={turn.result} onReply={onReply} sending={sending} animate={turn.animate} onProgress={onProgress} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatComposer({ value, onChange, onSubmit, busy, inputRef, onVoice, assistantName, voiceEnabled, catalog, onSelectTool }) {
  const [dismissedSlash, setDismissedSlash] = useState(null);
  const slashMatch = /(^|\s)\/([^\s/]*)$/.exec(value);
  const slashOpen = Boolean(slashMatch && !busy && dismissedSlash !== value);
  const query = slashMatch?.[2]?.toLowerCase() || "";
  const gmailConnected = catalog.connections.some(({ provider, is_active }) => provider === "gmail" && is_active !== false);
  const firstSelectable = PROVIDERS.find(({ provider, name }) =>
    (name.toLowerCase().includes(query) || provider.includes(query)) &&
    (provider === "gmail" ? gmailConnected : (catalog.demos || []).some((demo) => demo.provider === provider))
  );

  const selectIntegration = (provider) => {
    if (!slashMatch) return;
    onChange(value.slice(0, slashMatch.index) + slashMatch[1]);
    onSelectTool(provider);
    setDismissedSlash(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <form onSubmit={(event) => {
      if (slashMatch) {
        event.preventDefault();
        return;
      }
      onSubmit(event);
    }} className="relative mx-auto max-w-[820px]">
      {slashOpen && (
        <IntegrationSlashMenu query={query} catalog={catalog} onSelect={selectIntegration} />
      )}
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
            onChange={(e) => { setDismissedSlash(null); onChange(e.target.value); }}
            onKeyDown={(e) => {
              if (e.isComposing) return;
              if (slashMatch) {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissedSlash(value);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (slashOpen && !catalog.loading && !catalog.error && firstSelectable) selectIntegration(firstSelectable.provider);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder={`Message ${assistantName}...`}
            aria-controls={slashOpen ? "chat-integration-slash-menu" : undefined}
            aria-expanded={slashOpen}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-[15px] leading-[1.45] text-[#111315] outline-none placeholder:text-[#ADB5BD]"
          />
          <button
            type="submit"
            disabled={busy || !value.trim() || Boolean(slashMatch)}
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#111315] text-white transition-colors hover:bg-[#343A40] disabled:bg-[#E9ECEF] disabled:text-[#ADB5BD]"
            aria-label="Send"
          >
            <ArrowUpRight size={16} strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </form>
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const catalog = useIntegrationCatalog();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [agentPrefs, setAgentPrefs] = useState(readAgentPrefs);
  const askRef = useRef(null);
  const chatScrollRef = useRef(null);
  const followLatestRef = useRef(true);
  const replyInFlightRef = useRef(false);

  const askHere = useCallback(async (raw, options = {}) => {
    const text = (raw || "").trim();
    if (!text) {
      askRef.current?.focus();
      return;
    }
    if (chatBusy || replyInFlightRef.current) return;
    setAskText("");
    const currentConversationId = conversationId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!conversationId) setConversationId(currentConversationId);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const explicitProvider = PROVIDERS.find(({ provider, name }) => {
      const alias = provider === "teams" ? "(?:microsoft\\s+)?teams"
        : provider === "custom-api" ? "custom\\s+api"
          : provider === "olyxee" ? "olyxee(?:\\s+logistics)?"
            : name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${alias}\\b`, "i").test(text);
    });
    const gmailConnected = catalog.connections.some((entry) => entry.provider === "gmail" && entry.is_active !== false);
    const selectedProvider = selectedTool && (
      selectedTool === "gmail"
        ? gmailConnected
        : (catalog.demos || []).some((entry) => entry.provider === selectedTool)
    ) ? PROVIDERS.find((entry) => entry.provider === selectedTool) : null;
    const contextProvider = explicitProvider || selectedProvider;
    const latestResult = [...thread].reverse().find((item) => item.result)?.result;
    const gmailFollowUp = latestResult?.type === "gmail_search" && /\b(?:reply|respond|that|those|them|their|sender|messages?|e-?mails?|inbox)\b/i.test(text);
    const gmailRequest = options.gmailQuery !== undefined || contextProvider?.provider === "gmail" || /\b(?:gmail|e-?mail)\b/i.test(text) || (!explicitProvider && gmailFollowUp);
    const sampleProvider = !gmailRequest && contextProvider && (catalog.demos || []).some((entry) => entry.provider === contextProvider.provider) ? contextProvider : null;
    const commandText = selectedProvider && !explicitProvider && !gmailRequest ? `${text} ${selectedProvider.name}` : text;
    const activity = gmailRequest
      ? { kind: "gmail", provider: "gmail", label: "Searching connected Gmail" }
      : sampleProvider
        ? { kind: "integration", provider: sampleProvider.provider, sample: true, label: `Reviewing ${sampleProvider.name} sample records` }
        : { kind: "operations", label: "Checking operational data" };
    const toolContext = gmailRequest ? { name: "Gmail" } : sampleProvider ? { name: sampleProvider.name, demo: true } : null;
    followLatestRef.current = true;
    setThread((items) => [...items, { id, input: text, toolContext, busy: true, result: null, activity }]);
    setChatBusy(true);
    const startedAt = performance.now();
    let result;
    try {
      if (gmailRequest) {
        if (!gmailConnected) {
          result = { ok: false, type: "gmail_unconnected", summary: "Gmail is not connected to this workspace. Connect Gmail to search messages and review replies." };
        } else {
          const previous = [...thread].reverse().find((item) => item.result?.type === "gmail_search")?.result;
          const numberedReply = text.match(/\b(?:reply|respond)\s+to\s+(?:message\s*)?#?(\d+)(?:\s+(?:saying|with|:)\s*(.+))?/i);
          const addressedReply = text.match(/\b(?:reply|respond)\s+to\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})(?:\s+(?:saying|with|:)\s*(.+))?/i);
          const target = numberedReply ? previous?.items?.[Number(numberedReply[1]) - 1]
            : addressedReply ? previous?.items?.filter((item) => [item.reply_to, item.from].some((value) => value?.toLowerCase().includes(addressedReply[1].toLowerCase())))?.[0]
              : null;
          if (target) {
            result = {
              ok: true, type: "gmail_search", provider: "gmail", query: previous.query,
              items: [target], draftMessageId: target.id,
              draftBody: (numberedReply?.[2] || addressedReply?.[2] || "").trim(),
              summary: `Review a reply to ${target.reply_to || target.from}. Nothing has been sent.`,
            };
          } else if (numberedReply || addressedReply) {
            result = { ok: false, summary: "I couldn't identify that message in the latest Gmail results. Search again, then use Reply on the exact message or refer to its number." };
          } else {
            const query = (options.gmailQuery || gmailSearchQuery(text)).trim().slice(0, 300);
            const response = await searchGmail({ query, max_results: 10 });
            const messages = Array.isArray(response.results) ? response.results : [];
            const replyRequested = /\b(?:reply|respond)\b/i.test(text);
            result = {
              ok: true, type: "gmail_search", provider: "gmail", query: response.query || query,
              items: messages,
              summary: replyRequested
                ? `Found ${messages.length} recent ${messages.length === 1 ? "message" : "messages"} in connected Gmail. Choose the supplier message you mean, then write and confirm your reply. Nothing has been sent.`
                : `Found ${messages.length} ${messages.length === 1 ? "message" : "messages"} in connected Gmail. Select Reply on a message to compose a response.`,
            };
          }
        }
      } else {
        result = await sendCommand(commandText);
      }
    } catch (e) {
      result = { ok: false, requestFailed: true, summary: e?.message || "Aiviate could not answer that yet." };
    }
    const remaining = Math.max(0, 6000 - (performance.now() - startedAt));
    if (remaining > 0) {
      setThread((items) => items.map((item) => item.id === id
        ? { ...item, activity: { ...activity, phase: "preparing", label: "Preparing response" } }
        : item));
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    setThread((items) => items.map((item) => item.id === id ? { ...item, busy: false, result, animate: true } : item));
    setChatBusy(false);
  }, [conversationId, chatBusy, catalog.connections, catalog.demos, selectedTool, thread]);

  const handleGmailReply = async (message, body) => {
    if (chatBusy || replyInFlightRef.current) throw new Error("Wait for the current request to finish.");
    if (!message?.id || !body?.trim()) throw new Error("Select a message and write a reply first.");
    replyInFlightRef.current = true;
    const id = `${Date.now()}-reply-${Math.random().toString(36).slice(2, 7)}`;
    const currentConversationId = conversationId || `chat-${Date.now()}-gmail`;
    if (!conversationId) setConversationId(currentConversationId);
    followLatestRef.current = true;
    setThread((items) => [...items, { id, input: `Reply to ${message.reply_to || message.from} · ${message.subject}`, toolContext: { name: "Gmail" }, busy: true, result: null, activity: { kind: "gmail", provider: "gmail", label: "Sending your confirmed reply through Gmail" } }]);
    setChatBusy(true);
    try {
      const response = await replyGmail(message.id, body.trim());
      if (response?.ok !== true || !response.id || !response.recipient || !response.subject) {
        throw new Error("Gmail returned an incomplete send receipt. Check Sent before trying again, to avoid a duplicate.");
      }
      setThread((items) => items.map((item) => item.id === id ? { ...item, busy: false, result: {
        ok: true, type: "gmail_sent", provider: "gmail",
        recipient: response.recipient, subject: response.subject,
        summary: `Reply sent to ${response.recipient}.${response.warning ? ` ${response.warning}` : ""}`,
      } } : item));
      return response;
    } catch (err) {
      setThread((items) => items.map((item) => item.id === id ? { ...item, busy: false, result: { ok: false, requestFailed: true, summary: err?.message || "Gmail could not send this reply." } } : item));
      throw err;
    } finally {
      replyInFlightRef.current = false;
      setChatBusy(false);
    }
  };

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
      setSelectedTool(null);
      setToolsOpen(false);
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
      thread: completedThread.map(({ animate, ...turn }) => turn),
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
    const container = chatScrollRef.current;
    if (container && followLatestRef.current) container.scrollTop = container.scrollHeight;
  }, [thread]);

  const addVoiceMessage = (input, summary) => {
    const id = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!conversationId) setConversationId(`chat-${Date.now()}-voice`);
    setThread((items) => [...items, { id, input, busy: false, result: { ok: true, type: "voice", summary } }]);
  };

  const submitAsk = (e) => {
    e?.preventDefault?.();
    askHere(askText);
  };

  return (
    <div className="chat-shell ops-chat animate-fade-in flex h-[calc(100dvh-69px)] min-h-0 flex-col overflow-hidden bg-[#F8F9FA]">
      <div
        ref={chatScrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          followLatestRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-8 lg:px-12"
      >
        {thread.length === 0 ? (
          <EmptyChatOverview
            onPrompt={askHere}
            onProgress={() => {
              const container = chatScrollRef.current;
              if (container && followLatestRef.current) container.scrollTop = container.scrollHeight;
            }}
          />
        ) : (
          <div className="mx-auto max-w-[820px] space-y-8 pb-8">
            {thread.map((turn) => (
              <ChatTurn
                key={turn.id}
                turn={turn}
                assistantName={agentPrefs.assistant_name || "Aiviate"}
                onReply={catalog.connections.some((entry) => entry.provider === "gmail" && entry.is_active !== false) ? handleGmailReply : undefined}
                sending={chatBusy}
                onProgress={() => {
                  const container = chatScrollRef.current;
                  if (container && followLatestRef.current) container.scrollTop = container.scrollHeight;
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="chat-composer-dock z-20 shrink-0 bg-[#F8F9FA]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-8 lg:px-12">
        <IntegrationTools
          catalog={catalog}
          selected={selectedTool}
          onSelect={setSelectedTool}
          onGmailSearch={(query) => askHere(`Search Gmail for ${query}`, { gmailQuery: query })}
          onDemoPrompt={(prompt) => askHere(prompt)}
          open={toolsOpen}
          onToggle={() => setToolsOpen((value) => !value)}
          busy={chatBusy}
        />
        <ChatComposer
          value={askText}
          onChange={setAskText}
          onSubmit={submitAsk}
          busy={chatBusy}
          inputRef={askRef}
          onVoice={() => setVoiceOpen(true)}
          assistantName={agentPrefs.assistant_name || "Aiviate"}
          voiceEnabled={agentPrefs.voice_mode}
          catalog={catalog}
          onSelectTool={setSelectedTool}
        />
      </div>
      <VoiceMode
        open={voiceOpen && agentPrefs.voice_mode}
        onClose={() => setVoiceOpen(false)}
        onBriefing={(summary) => addVoiceMessage("How is the business doing?", summary)}
        onReply={({ heard, summary }) => addVoiceMessage(heard, summary)}
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
