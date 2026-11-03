const HISTORY_KEY = "aiviate_chat_history";
const PENDING_CHAT_KEY = "aiviate_pending_chat_id";
const MAX_HISTORY = 30;

function safeParse(value, fallback) {
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

export const PINNED_PROMPT = {
  id: "pinned-supplier-order-check",
  pinned: true,
  title: "Check supplier email: AIV-1042",
  prompt: "Check gmail for latest supplier email about order AIV-1042. Tell me whether it is confirmed, who sent it, then deploy it",
  thread: [],
  updated_at: "9999-12-31T00:00:00.000Z",
};

export function readChatHistory() {
  const saved = safeParse(localStorage.getItem(HISTORY_KEY), []);
  return [PINNED_PROMPT, ...saved.filter((item) => item.id !== PINNED_PROMPT.id)];
}

export function writeChatHistory(items) {
  const normalized = [...items]
    .filter((item) => item?.id && !item.pinned &&  Array.isArray(item.thread) && item.thread.length)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("aiviate:chat-history-updated", { detail: normalized }));
  return normalized;
}

export function upsertChatHistory(conversation) {
  const current = readChatHistory();
  const next = [
    conversation,
    ...current.filter((item) => item.id !== conversation.id),
  ];
  return writeChatHistory(next);
}

export function getChatHistoryItem(id) {
  return readChatHistory().find((item) => item.id === id) || null;
}

export function titleFromThread(thread = []) {
  const first = thread.find((turn) => turn?.input?.trim());
  const title = first?.input?.trim() || "New conversation";
  return title.length > 42 ? `${title.slice(0, 39)}...` : title;
}

export function queueChatOpen(id) {
  if (id) localStorage.setItem(PENDING_CHAT_KEY, id);
}

export function takeQueuedChatOpen() {
  const id = localStorage.getItem(PENDING_CHAT_KEY);
  if (id) localStorage.removeItem(PENDING_CHAT_KEY);
  return id || null;
}
