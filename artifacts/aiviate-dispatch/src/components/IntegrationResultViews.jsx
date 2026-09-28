import { useRef, useState } from "react";
import { ProviderLogo, PROVIDERS } from "./IntegrationTools";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#547784] focus-visible:ring-offset-2";

function displayDate(value) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

// Only the structured From header may supply a reply recipient; never use the
// search query, snippet, body, or the user's draft to determine an address.
function replyAddress(message) {
  const source = message?.reply_to || message?.from;
  if (typeof source !== "string") return "";
  const enclosed = source.match(/<([^<>]+)>/);
  const candidate = (enclosed ? enclosed[1] : source).trim();
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(candidate) ? candidate : "";
}

function ReplyComposer({ message, body, setBody, preview, setPreview, error, submitting, onConfirm, onCancel, index, variant }) {
  const to = replyAddress(message);
  const subject = /^re:/i.test(message.subject || "") ? message.subject : `Re: ${message.subject || "(no subject)"}`;
  const id = `gmail-reply-${variant}-${index}`;

  return (
    <div className="space-y-2.5 bg-[#f7f8f8] px-3 py-3 text-[12px] text-[#253138] sm:px-4" data-testid={`panel-gmail-reply-${variant}-${index}`}>
      <label htmlFor={id} className="block font-semibold">Your reply</label>
      <textarea
        id={id}
        data-testid={`input-gmail-reply-${variant}-${index}`}
        rows={3}
        value={body}
        onChange={(event) => { setBody(event.target.value); setPreview(false); }}
        disabled={submitting}
        placeholder="Write your message…"
        className={`block w-full resize-y rounded-lg border border-[#d9e0e2] bg-[#fdfdfc] px-3 py-2 leading-relaxed text-[#253138] placeholder:text-[#89959a] ${focusRing}`}
      />
      {preview && (
        <div className="space-y-1.5 rounded-lg border border-[#dce2e4] bg-[#fdfdfc] px-3 py-2.5" aria-label="Reply preview" data-testid={`panel-gmail-preview-${variant}-${index}`}>
          <p><span className="inline-block w-14 text-[#718087]">To</span><span className="break-all">{to || "Recipient unavailable"}</span></p>
          <p><span className="inline-block w-14 text-[#718087]">Subject</span><span className="break-words">{subject}</span></p>
          <div className="border-t border-[#e5e9ea] pt-2">
            <span className="mb-1 block text-[#718087]">Body</span>
            <p className="whitespace-pre-wrap break-words" data-testid={`text-gmail-preview-body-${variant}-${index}`}>{body}</p>
          </div>
        </div>
      )}
      {!to && <p className="text-[#8b5147]" role="status">This message has no valid sender address to reply to.</p>}
      {error && <p role="alert" className="text-[#a24137]" data-testid={`status-gmail-reply-error-${variant}-${index}`}>{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!preview ? (
          <button type="button" onClick={() => setPreview(true)} disabled={!body.trim() || !to || submitting} data-testid={`button-preview-gmail-reply-${variant}-${index}`} className={`rounded-lg bg-[#365965] px-3 py-1.5 font-semibold text-[#f9faf9] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}>Preview reply</button>
        ) : (
          <button type="button" onClick={onConfirm} disabled={!body.trim() || !to || submitting} data-testid={`button-confirm-gmail-reply-${variant}-${index}`} className={`rounded-lg bg-[#365965] px-3 py-1.5 font-semibold text-[#f9faf9] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}>{submitting ? "Sending…" : "Confirm send"}</button>
        )}
        <button type="button" onClick={onCancel} disabled={submitting} data-testid={`button-cancel-gmail-reply-${variant}-${index}`} className={`rounded-lg px-2.5 py-1.5 font-medium text-[#52656d] hover:bg-[#ebeff0] disabled:opacity-45 ${focusRing}`}>Cancel</button>
      </div>
    </div>
  );
}

export function GmailResults({ result, onReply, sending = false }) {
  const [activeId, setActiveId] = useState(result?.draftMessageId || null);
  const [body, setBody] = useState(result?.draftBody || "");
  const [preview, setPreview] = useState(Boolean(result?.draftBody));
  const [error, setError] = useState("");
  const [sentIds, setSentIds] = useState([]);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const items = Array.isArray(result?.items) ? result.items : [];

  if (!result || result.ok === false || result.error) {
    return <div role="alert" className="text-[12px] text-[#a24137]" data-testid="status-gmail-results-error">{typeof result?.error === "string" ? result.error : "Could not load Gmail messages."}</div>;
  }

  const close = () => { setActiveId(null); setBody(""); setPreview(false); setError(""); };
  const open = (id) => { setActiveId(id); setBody(""); setPreview(false); setError(""); };
  const confirm = async (message) => {
    if (!preview || !body.trim() || !replyAddress(message) || !onReply || inFlight.current || sending) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      // Do not optimistically mark as sent: the caller owns the actual send.
      await onReply(message, body);
      setSentIds((previous) => [...previous, message.id]);
      close();
    } catch (failure) {
      setError(failure?.message || "Reply could not be sent. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const composer = (message, index, variant) => (
    <ReplyComposer
      message={message}
      index={index}
      variant={variant}
      body={body}
      setBody={setBody}
      preview={preview}
      setPreview={setPreview}
      error={error}
      submitting={pending || sending}
      onConfirm={() => confirm(message)}
      onCancel={close}
    />
  );
  const replyControl = (message, index, variant) => {
    if (sentIds.includes(message.id)) return <span role="status" data-testid={`status-gmail-reply-sent-${variant}-${index}`} className="font-medium text-[#467766]">Sent</span>;
    if (!onReply || activeId === message.id) return null;
    return <button type="button" onClick={() => open(message.id)} disabled={sending || pending} aria-label={`Reply to ${message.from || "message"} about ${message.subject || "(no subject)"}`} data-testid={`button-reply-gmail-${variant}-${index}`} className={`rounded-md px-2 py-1 font-semibold text-[#365965] hover:bg-[#eaf0f1] disabled:opacity-45 ${focusRing}`}>Reply</button>;
  };

  return (
    <section aria-label="Connected Gmail search results" className="min-w-0 text-[#253138]">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#52656d]">
        <ProviderLogo provider="gmail" size={16} />
        <span>Connected Gmail</span>
        {result.query && <span className="min-w-0 truncate font-normal text-[#718087]">/ {result.query}</span>}
      </div>
      {!items.length ? <p className="border-t border-[#e5e9ea] py-3 text-[12px] text-[#718087]" data-testid="status-gmail-results-empty">No matching messages.</p> : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full table-fixed border-collapse text-left text-[12px]">
              <caption className="sr-only">Messages matching your connected Gmail search</caption>
              <thead className="border-y border-[#e2e7e9] bg-[#f7f8f8] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#718087]">
                <tr><th scope="col" className="w-[23%] px-3 py-2">From</th><th scope="col" className="w-[48%] px-3 py-2">Message</th><th scope="col" className="w-[18%] px-3 py-2">Date</th><th scope="col" className="w-[11%] px-2 py-2 text-right">Action</th></tr>
              </thead>
              <tbody>
                {items.map((message, index) => (
                  <FragmentRow key={message.id || index}>
                    <tr className="border-b border-[#e8ebec] align-top" data-testid={`row-gmail-message-${index}`}>
                      <td className="break-words px-3 py-2.5 font-medium"><span className="mr-1 text-[#89959a]">#{index + 1}</span>{message.from || "Unknown sender"}</td>
                      <td className="px-3 py-2.5"><span className="block break-words font-semibold">{message.subject || "(no subject)"}</span><span className="mt-0.5 block break-words text-[11px] leading-relaxed text-[#718087]">{message.snippet || message.body_preview || ""}</span></td>
                      <td className="px-3 py-2.5 text-[11px] text-[#718087]">{displayDate(message.date)}</td>
                      <td className="px-2 py-2 text-right">{replyControl(message, index, "desktop")}</td>
                    </tr>
                    {activeId === message.id && onReply && <tr><td colSpan={4} className="p-0">{composer(message, index, "desktop")}</td></tr>}
                  </FragmentRow>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-[#e5e9ea] border-y border-[#e5e9ea] sm:hidden">
            {items.map((message, index) => (
              <li key={message.id || index} className="py-2.5" data-testid={`item-gmail-message-${index}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-[12px] font-semibold"><span className="mr-1 text-[#89959a]">#{index + 1}</span>{message.from || "Unknown sender"}</span>
                  <time className="shrink-0 text-[10px] text-[#718087]">{displayDate(message.date)}</time>
                </div>
                <p className="mt-0.5 break-words text-[12px] font-medium">{message.subject || "(no subject)"}</p>
                {(message.snippet || message.body_preview) && <p className="mt-0.5 break-words text-[11px] leading-relaxed text-[#718087]">{message.snippet || message.body_preview}</p>}
                {(onReply || sentIds.includes(message.id)) && <div className="mt-1.5 -ml-2">{replyControl(message, index, "mobile")}</div>}
                {activeId === message.id && onReply && <div className="mt-2">{composer(message, index, "mobile")}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// A fragment keeps the detail row adjacent to its message without invalid
// markup inside tbody.
function FragmentRow({ children }) {
  return <>{children}</>;
}

export function SampleResult({ result }) {
  if (!result) return null;
  const provider = PROVIDERS.find((entry) => entry.provider === result.provider?.toLowerCase());
  const items = Array.isArray(result.items) ? result.items : [];
  const scenario = result.scenario;
  return (
    <section aria-label={`${provider?.name || result.provider || "Integration"} sample results`} className="min-w-0 text-[12px] text-[#253138]">
      <div className="flex items-center gap-2 border-b border-[#e2e7e9] pb-2">
        {provider && <ProviderLogo provider={provider.provider} size={17} />}
        <span className="font-semibold">{provider?.name || result.provider || "Integration"}</span>
        <span className="ml-auto text-right text-[10px] font-medium text-[#718087]" data-testid="status-sample-only">Sample data · no live actions</span>
      </div>
      {(result.error || result.ok === false) && <p role="alert" className="py-2 text-[#a24137]">{typeof result.error === "string" ? result.error : "Sample results unavailable."}</p>}
      {scenario && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-[#e8ebec] py-2.5 leading-relaxed">
          {scenario.issue && <><dt className="font-medium text-[#718087]">Issue</dt><dd className="break-words" data-testid="text-sample-issue">{scenario.issue}</dd></>}
          {scenario.check && <><dt className="font-medium text-[#718087]">Check</dt><dd className="break-words" data-testid="text-sample-check">{scenario.check}</dd></>}
          {scenario.resolution && <><dt className="font-medium text-[#718087]">Resolution</dt><dd className="break-words" data-testid="text-sample-resolution">{scenario.resolution}</dd></>}
        </dl>
      )}
      {items.length ? (
        <ul className="divide-y divide-[#e8ebec]" aria-label="Sample items">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="py-2" data-testid={`item-sample-result-${index}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words font-semibold">{item.label}</span>
                {item.meta && <span className="shrink-0 text-right text-[11px] text-[#718087]">{item.meta}</span>}
              </div>
              {item.detail && <p className="mt-0.5 break-words text-[11px] leading-relaxed text-[#52656d]">{item.detail}</p>}
            </li>
          ))}
        </ul>
      ) : !scenario && !result.error && <p className="py-3 text-[#718087]" data-testid="status-sample-empty">No sample items to show.</p>}
    </section>
  );
}