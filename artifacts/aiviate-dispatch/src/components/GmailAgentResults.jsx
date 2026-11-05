import { useRef, useState } from "react";
import { GmailResults } from "./IntegrationResultViews";
import { ProviderLogo } from "./IntegrationTools";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#547784] focus-visible:ring-offset-2";

// One reply, waiting for a person. The recipient and subject come from the original
// email (set by the server) and can't be edited here; only the text can. Sending is a
// separate, deliberate step that names the exact revision shown on screen.
function DraftCard({ draft: initial, actions, index }) {
  const [draft, setDraft] = useState(initial);
  const [body, setBody] = useState(initial.body);
  const [state, setState] = useState("idle"); // idle | saving | sending | discarding | sent | discarded
  const [error, setError] = useState("");
  const busy = useRef(false);
  const dirty = body !== draft.body;
  const working = ["saving", "sending", "discarding"].includes(state);
  const byAi = draft.author === "agent";

  const run = async (next, task) => {
    if (busy.current) return; // a double click can't start a second request
    busy.current = true;
    setState(next);
    setError("");
    try {
      await task();
    } catch (failure) {
      setError(failure?.message || "That didn't work. Please try again.");
      setState("idle");
    } finally {
      busy.current = false;
    }
  };

  const save = () => run("saving", async () => {
    const updated = await actions.onEdit(draft, body);
    setDraft(updated);
    setBody(updated.body);
    setState("idle");
  });
  const approve = () => run("sending", async () => {
    await actions.onApprove(draft);
    setState("sent");
  });
  const discard = () => run("discarding", async () => {
    await actions.onDiscard(draft);
    setState("discarded");
  });

  if (state === "sent") {
    return (
      <div role="status" data-testid={`draft-sent-${index}`} className="rounded-xl border border-[#cfe3d9] bg-[#f3f9f6] px-3.5 py-3 text-[12px] text-[#2f5d4a]">
        <span className="font-semibold">Sent</span> to {draft.recipient} · {draft.subject}
      </div>
    );
  }
  if (state === "discarded") {
    return (
      <div role="status" data-testid={`draft-discarded-${index}`} className="rounded-xl border border-[#e5e9ea] bg-[#f7f8f8] px-3.5 py-3 text-[12px] text-[#718087]">
        Discarded. Nothing was sent to {draft.recipient}.
      </div>
    );
  }

  return (
    <article aria-label={`Draft reply to ${draft.recipient}`} data-testid={`draft-${index}`} className="space-y-2.5 rounded-xl border border-[#dbe2e4] bg-[#fdfdfc] px-3.5 py-3 text-[12px] text-[#253138]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-[#eef3f4] px-2 py-0.5 text-[11px] font-semibold text-[#365965]">
          {byAi ? "Drafted by AI" : "Your draft"} · not sent yet
        </span>
        <span className="text-[11px] text-[#718087]">Revision {draft.revision}</span>
      </div>

      <p><span className="inline-block w-14 text-[#718087]">To</span><span className="break-all font-medium" data-testid={`draft-to-${index}`}>{draft.recipient}</span></p>
      <p><span className="inline-block w-14 text-[#718087]">Subject</span><span className="break-words">{draft.subject}</span></p>

      <details className="rounded-lg bg-[#f4f6f6] px-2.5 py-1.5">
        <summary className="cursor-pointer text-[11px] font-semibold text-[#52656d]">Original email from {draft.source?.from || "sender"}</summary>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[#52656d]" data-testid={`draft-source-${index}`}>
          {draft.source?.subject ? `${draft.source.subject}\n` : ""}{draft.source?.snippet || "(no preview)"}
        </p>
      </details>

      <label className="block">
        <span className="mb-1 block font-semibold">Reply text (you can edit it)</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={working}
          rows={6}
          data-testid={`draft-body-${index}`}
          className={`block w-full resize-y rounded-lg border border-[#d9e0e2] bg-white px-3 py-2 leading-relaxed text-[#253138] ${focusRing}`}
        />
      </label>

      {error && <p role="alert" className="text-[#a24137]" data-testid={`draft-error-${index}`}>{error}</p>}
      {dirty && <p className="text-[#8b5147]" role="status">You've changed the text. Save it before approving so you approve exactly what will be sent.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={working || dirty || !body.trim()}
          data-testid={`draft-approve-${index}`}
          className={`rounded-lg bg-[#365965] px-3 py-1.5 font-semibold text-[#f9faf9] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}
        >
          {state === "sending" ? "Sending…" : "Approve & send"}
        </button>
        {dirty && (
          <button type="button" onClick={save} disabled={working || !body.trim()} data-testid={`draft-save-${index}`} className={`rounded-lg border border-[#c9d3d6] px-3 py-1.5 font-semibold text-[#365965] disabled:opacity-45 ${focusRing}`}>
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
        )}
        <button type="button" onClick={discard} disabled={working} data-testid={`draft-discard-${index}`} className={`rounded-lg px-2.5 py-1.5 font-medium text-[#52656d] hover:bg-[#ebeff0] disabled:opacity-45 ${focusRing}`}>
          Discard
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-[#718087]">
        Nothing is emailed until you press Approve &amp; send. It will go to {draft.recipient}, taken from the original email.
      </p>
    </article>
  );
}

// The chat's answer when the email assistant is on: a summary, plus any replies it drafted.
export default function GmailAgentResults({ result, onReply, sending, draftActions }) {
  const drafts = Array.isArray(result?.drafts) ? result.drafts : [];
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  const items = Array.isArray(result?.items) ? result.items : [];

  return (
    <section aria-label="Email assistant results" className="min-w-0 space-y-3 text-[#253138]">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#52656d]">
        <ProviderLogo provider="gmail" size={16} />
        <span>Connected Gmail · AI assistant</span>
        {result?.query && <span className="min-w-0 truncate font-normal text-[#718087]">/ {result.query}</span>}
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-[#fbf3f1] px-3 py-2 text-[12px] text-[#8b5147]" data-testid="agent-warnings">
          {warnings.map((warning, i) => <li key={i}>{warning}</li>)}
        </ul>
      )}

      {drafts.length > 0 && draftActions ? (
        <div className="space-y-2.5">
          <p className="text-[12px] font-semibold">
            {drafts.length === 1 ? "1 reply is" : `${drafts.length} replies are`} waiting for your approval
          </p>
          {drafts.map((draft, index) => (
            <DraftCard key={draft.id} draft={draft} actions={draftActions} index={index} />
          ))}
        </div>
      ) : (
        result?.input && /\b(reply|respond|draft)\b/i.test(result.input) && (
          <p className="text-[12px] text-[#718087]" data-testid="agent-no-drafts">I didn't draft any replies for these emails.</p>
        )
      )}

      {skipped.length > 0 && (
        <details className="text-[11px] text-[#718087]">
          <summary className="cursor-pointer font-semibold">{skipped.length} not drafted</summary>
          <ul className="mt-1 space-y-0.5">{skipped.map((s, i) => <li key={i}>{s.reason}</li>)}</ul>
        </details>
      )}

      <details className="rounded-lg border border-[#e5e9ea] px-3 py-2" open={drafts.length === 0}>
        <summary className="cursor-pointer text-[12px] font-semibold text-[#365965]">
          Emails found ({items.length})
        </summary>
        <div className="mt-2">
          <GmailResults result={{ ...result, type: "gmail_search" }} onReply={onReply} sending={sending} />
        </div>
      </details>
    </section>
  );
}
