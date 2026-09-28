const PROMPTS = ["show jobs", "show drivers", "show alerts"];
const PRIORITY = { active: 0, idle: 1, no_signal: 2, error: 3 };

export default function EmptyChatOverview({ agents, loading, error, onRetry, onPrompt }) {
  const updates = (Array.isArray(agents) ? agents : [])
    .filter((agent) => agent?.name && agent?.note)
    .sort((a, b) => (PRIORITY[a.state] ?? 4) - (PRIORITY[b.state] ?? 4))
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[760px] pb-8 pt-8 sm:pt-12" data-testid="empty-chat-overview">
      <div className="space-y-6" aria-label="Agent updates">
        {loading ? (
          <p role="status" className="text-[13px] text-[#697177]">Checking agent updates…</p>
        ) : error ? (
          <div role="alert" className="flex items-center gap-3 text-[13px] text-[#5C636A]">
            <span>Agent updates are unavailable.</span>
            <button type="button" onClick={onRetry} className="font-medium text-[#111315] underline underline-offset-4">Retry</button>
          </div>
        ) : updates.length ? updates.map((agent, index) => (
          <div key={`${agent.name}-${index}`} className="flex items-start gap-3" data-testid={`agent-message-${index}`}>
            <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9ECEF] text-[11px] font-semibold text-[#343A40]">
              {agent.name.trim().slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[12px] font-semibold text-[#343A40]">{agent.name}</p>
              <p className="mt-1 text-[14px] leading-[1.55] text-[#343A40]">{agent.note}</p>
            </div>
          </div>
        )) : (
          <p className="text-[13px] text-[#697177]">No agent updates yet.</p>
        )}
      </div>

      <div className="mt-10 flex flex-wrap gap-2" aria-label="Suggested prompts">
        {PROMPTS.map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt?.(prompt)}
            data-testid={`button-overview-prompt-${index}`}
            className="rounded-full border border-[#DEE2E6] bg-white px-3.5 py-2 text-left text-[12px] text-[#343A40] transition-colors hover:bg-[#F1F3F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#343A40]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}