import { Activity, Check, FileText, Mail, Plug2 } from "lucide-react";
import { ProviderLogo } from "./IntegrationTools";

const SOURCE_ICONS = {
  gmail: Mail,
  documents: FileText,
  integration: Plug2,
  operations: Activity,
};

/**
 * A request activity receipt. Pending steps describe the request in flight;
 * completed steps are derived from the server response, not a timer or
 * invented model reasoning.
 */
export default function ChatActivity({ activity, assistantName = "Aiviate", result = null }) {
  if (!activity || !Object.hasOwn(SOURCE_ICONS, activity.kind)) return null;

  const Icon = SOURCE_ICONS[activity.kind];
  const provider = activity.provider || (activity.kind === "gmail" ? "gmail" : null);
  const sample = Boolean(activity.sample);
  const name = typeof assistantName === "string" && assistantName.trim() ? assistantName.trim() : "Aiviate";
  const label = typeof activity.label === "string" ? activity.label.trim() : "";
  const complete = result !== null;
  const connectionFailed = Boolean(result?.requestFailed);
  const itemCount = Array.isArray(result?.items) ? result.items.length : null;
  const outcome = connectionFailed
    ? "Could not complete the request"
    : result?.ok === false
      ? "Request returned a limitation · no action confirmed"
      : result?.demo
        ? `Reviewed ${itemCount ?? "available"} ${result.provider || "integration"} sample ${itemCount === 1 ? "record" : "records"} · no external account connected`
        : result?.type === "gmail_search"
          ? `Searched connected Gmail${itemCount !== null ? ` · ${itemCount} ${itemCount === 1 ? "message" : "messages"} found` : ""}`
          : result?.type === "gmail_sent"
            ? `Sent a reply to ${result.recipient}`
          : result?.type === "llm"
            ? "Received an AI response"
            : ["jobs", "drivers", "alerts"].includes(result?.type) && itemCount !== null
              ? `Checked ${itemCount} ${{ jobs: "job", drivers: "driver", alerts: "alert" }[result.type]} ${itemCount === 1 ? "record" : "records"}`
              : "Received a response from Aiviate";

  return (
    <div
      role={complete ? undefined : "status"}
      aria-live={complete ? undefined : "polite"}
      aria-atomic={complete ? undefined : "true"}
      data-testid="status-chat-activity"
      className="border-l-2 border-[#d4dedb] py-1 pl-3 text-[#495057]"
    >
      <p className="mb-1.5 text-[11px] font-semibold text-[#343A40]">{name} · {complete ? "Activity" : "Working"}</p>
      <div className="space-y-1.5 text-[12px] leading-snug text-[#5C636A]">
        <div className="flex items-center gap-2" data-testid="status-agent-connection">
          {complete && !connectionFailed ? <Check size={13} className="shrink-0" aria-hidden="true" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7F8A90] motion-safe:animate-pulse" aria-hidden="true" />}
          <span>{connectionFailed ? "Request failed" : complete ? (sample ? "Sample preview ready" : "Connected to Aiviate") : activity.phase === "preparing" ? "Response ready" : sample ? "Opening sample preview" : "Connecting to Aiviate"}</span>
        </div>
        <div className="flex items-center gap-2" data-testid="status-agent-source">
          {provider ? <ProviderLogo provider={provider} size={15} /> : <Icon size={13} className="shrink-0" aria-hidden="true" />}
          <span>{complete ? outcome : label || "Processing request"}</span>
        </div>
      </div>
    </div>
  );
}