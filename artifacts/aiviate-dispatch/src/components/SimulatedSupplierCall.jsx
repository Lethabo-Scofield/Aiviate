import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mail, Phone, PhoneOff, Voicemail } from "lucide-react";

// Playback of a scripted supplier call + fallback email (see lib/supplierCallScenario.js).
// Everything here is simulated: no call is placed, Retell AI is not contacted, no email is sent.

const AGENT = "Aiviate Supplier Desk";
const T = {
  connected: 1400,
  ring1Start: 2800,
  attempt1Ends: 7000,
  ring2Start: 8200,
  attempt2Ends: 11500,
  unreachable: 12500,
  draftReady: 13000,
};
const TOTAL = T.draftReady;
const sentKey = (callId) => `aiviate_sim_call_sent_${callId}`;

function readSent(callId) {
  try { return localStorage.getItem(sentKey(callId)) === "1"; } catch { return false; }
}

function Row({ state, icon: Icon, title, detail }) {
  const color = state === "fail" ? "text-[#A24137]" : state === "done" ? "text-[#2F6B45]" : "text-[#365965]";
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] ${color}`}>
        {state === "active" ? <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <Icon size={13} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[#111315]">{title}</span>
        {detail && <span className="block text-[12px] text-[#697177]">{detail}</span>}
      </span>
    </li>
  );
}

export default function SimulatedSupplierCall({ result, onProgress }) {
  const { callId, supplier, draft, purpose } = result;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const restored = Date.now() - (result.startedAt || 0) > 60000;
  const [elapsed, setElapsed] = useState(reduced || restored ? TOTAL : 0);
  const [sendState, setSendState] = useState(() => (readSent(callId) ? "sent" : "idle")); // idle | sending | sent | discarded
  const timer = useRef(null);

  useEffect(() => {
    if (elapsed >= TOTAL) return undefined;
    const startedAt = performance.now() - elapsed;
    timer.current = window.setInterval(() => {
      const next = Math.min(TOTAL, performance.now() - startedAt);
      setElapsed(next);
      if (next >= TOTAL) window.clearInterval(timer.current);
    }, 200);
    return () => window.clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const t = elapsed;
  const ringCount = Math.min(4, Math.max(1, Math.floor((t - T.ring1Start) / 1000) + 1));
  const ringCount2 = Math.min(4, Math.max(1, Math.floor((t - T.ring2Start) / 1000) + 1));
  const showDraft = t >= T.draftReady;
  const gaveUp = t >= T.unreachable;

  useEffect(() => {
    onProgress?.();
  }, [Math.floor(t / 1000), sendState, showDraft, onProgress]);

  const approve = () => {
    if (sendState !== "idle") return;
    setSendState("sending");
    window.setTimeout(() => {
      try { localStorage.setItem(sentKey(callId), "1"); } catch { /* the sent state just will not persist */ }
      setSendState("sent");
    }, 1700);
  };

  const rows = [];
  rows.push(
    t < T.connected
      ? { key: "connect", state: "active", icon: Phone, title: "Connecting to Retell AI", detail: `Starting voice agent “${AGENT}”` }
      : { key: "connect", state: "done", icon: CheckCircle2, title: "Connected to Retell AI", detail: `Voice agent “${AGENT}” · ${callId}` },
  );
  if (t >= T.connected) {
    if (t < T.ring1Start) rows.push({ key: "a1", state: "active", icon: Phone, title: `Dialing ${supplier.name}`, detail: supplier.phone });
    else if (t < T.attempt1Ends) rows.push({ key: "a1", state: "active", icon: Phone, title: `Ringing ${supplier.name}`, detail: `${supplier.phone} · ring ${ringCount}` });
    else rows.push({ key: "a1", state: "fail", icon: PhoneOff, title: "No answer", detail: `Attempt 1 of 2 · ${supplier.phone} · call ended after 4 rings (0:24)` });
  }
  if (t >= T.attempt1Ends) {
    if (t < T.ring2Start) rows.push({ key: "a2", state: "active", icon: Phone, title: "Trying again", detail: `Attempt 2 of 2 · ${supplier.phone}` });
    else if (t < T.attempt2Ends) rows.push({ key: "a2", state: "active", icon: Phone, title: `Ringing ${supplier.name}`, detail: `Attempt 2 of 2 · ring ${ringCount2}` });
    else rows.push({ key: "a2", state: "fail", icon: Voicemail, title: "Went to voicemail", detail: "Attempt 2 of 2 · call ended without leaving a message (0:31)" });
  }

  const statusLine = rows[rows.length - 1];

  return (
    <section aria-label="Supplier call (simulation)" className="min-w-0 space-y-3 text-[#253138]" data-testid="simulated-supplier-call">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[#52656d]">
        <span className="flex items-center gap-2"><Phone size={13} aria-hidden="true" /> Supplier call · via Retell AI</span>
        <span className="rounded-full bg-[#EEF3F4] px-2 py-0.5 font-medium text-[#365965]">Simulation</span>
      </div>

      <ul className="divide-y divide-[#EEF1F2] rounded-xl border border-[#E5E9EA] bg-white px-3.5" aria-label="Call progress">
        {rows.map(({ key, ...row }) => <Row key={key} {...row} />)}
      </ul>
      <span className="sr-only" role="status">{statusLine ? `${statusLine.title}. ${statusLine.detail || ""}` : ""}</span>

      {gaveUp && (
        <p className="animate-fade-in text-[14px] leading-[1.6] text-[#111315]" data-testid="call-fallback-message">
          {purpose === "restock"
            ? `I couldn't reach ${supplier.name} by phone after two attempts, so I've drafted a restock email with the items we're low on.`
            : `I couldn't reach ${supplier.name} by phone after two attempts, so I've drafted an email asking for an update on order ${result.order}.`}
        </p>
      )}

      {showDraft && sendState !== "discarded" && (
        <article aria-label={`Email to ${draft.to}`} className="animate-fade-in space-y-2.5 rounded-xl border border-[#dbe2e4] bg-[#fdfdfc] px-3.5 py-3 text-[12px]" data-testid="supplier-email-draft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-[#eef3f4] px-2 py-0.5 text-[11px] font-semibold text-[#365965]">
              <Mail size={12} aria-hidden="true" /> {sendState === "sent" ? "Sent" : "Drafted by AI · not sent yet"}
            </span>
          </div>
          <p><span className="inline-block w-14 text-[#718087]">To</span><span className="break-all font-medium">{draft.to}</span></p>
          <p><span className="inline-block w-14 text-[#718087]">Subject</span><span className="break-words">{draft.subject}</span></p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#f4f6f6] px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-[#253138]">{draft.body}</pre>

          {sendState === "sent" ? (
            <p role="status" className="flex items-start gap-2 text-[#2f5d4a]" data-testid="supplier-email-sent">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold">Email sent</span> to {draft.to}
                <span className="block text-[11px] text-[#718087]">Message ID &lt;{callId}@mail.aiviate.example&gt; · simulation, no real email was sent</span>
              </span>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={approve}
                disabled={sendState === "sending"}
                data-testid="supplier-email-approve"
                className="rounded-lg bg-[#365965] px-3 py-1.5 font-semibold text-[#f9faf9] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#547784] focus-visible:ring-offset-2"
              >
                {sendState === "sending" ? "Sending…" : "Approve & send"}
              </button>
              <button
                type="button"
                onClick={() => setSendState("discarded")}
                disabled={sendState === "sending"}
                data-testid="supplier-email-discard"
                className="rounded-lg px-2.5 py-1.5 font-medium text-[#52656d] hover:bg-[#ebeff0] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#547784] focus-visible:ring-offset-2"
              >
                Discard
              </button>
            </div>
          )}
        </article>
      )}

      {sendState === "discarded" && (
        <p role="status" className="rounded-xl bg-[#f7f8f8] px-3.5 py-3 text-[12px] text-[#718087]">Discarded. Nothing was sent to {supplier.name}.</p>
      )}
    </section>
  );
}
