import { Link } from "react-router-dom";
import { ProviderLogo, PROVIDERS } from "./IntegrationTools";

const SORTED_PROVIDERS = [
  ...PROVIDERS.filter(({ provider }) => provider === "gmail"),
  ...PROVIDERS.filter(({ provider }) => provider !== "gmail"),
];

export default function IntegrationSlashMenu({ query, catalog, onSelect }) {
  const matches = SORTED_PROVIDERS.filter(({ name, provider }) =>
    name.toLowerCase().includes(query) || provider.includes(query)
  );
  const gmailConnected = catalog.connections.some(({ provider, is_active }) =>
    provider === "gmail" && is_active !== false
  );

  return (
    <div
      id="chat-integration-slash-menu"
      role="dialog"
      aria-label="Choose an integration"
      className="absolute bottom-full left-0 z-30 mb-2 max-h-[min(340px,45dvh)] w-full overflow-y-auto rounded-2xl border border-[#DEE2E6] bg-white p-2 shadow-[0_16px_40px_rgba(17,19,21,0.14)]"
      data-testid="menu-integration-slash"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#868E96]">Integrations</p>
        <kbd className="rounded border border-[#DEE2E6] px-1.5 py-0.5 text-[10px] text-[#868E96]">Esc to close</kbd>
      </div>
      {catalog.loading ? (
        <p role="status" className="px-2.5 py-3 text-[12px] text-[#5C636A]">Checking connections…</p>
      ) : catalog.error ? (
        <p role="alert" className="px-2.5 py-3 text-[12px] text-[#5C636A]">Could not check connections. Open Tools to retry.</p>
      ) : matches.length === 0 ? (
        <p className="px-2.5 py-3 text-[12px] text-[#868E96]">No integrations match “{query}”.</p>
      ) : matches.map(({ provider, name }) => {
        const connected = provider === "gmail" && gmailConnected;
        const demoReady = (catalog.demos || []).some((demo) => demo.provider === provider);
        const row = (
          <>
            <span className="flex w-7 shrink-0 justify-center grayscale"><ProviderLogo provider={provider} size={18} /></span>
            <span className="min-w-0 flex-1 truncate font-medium text-[#111315]">{name}</span>
            <span className="shrink-0 text-[11px] text-[#868E96]">
               {connected ? "Connected" : demoReady ? "Sample data" : provider === "gmail" ? "Connect" : "Unavailable"}
            </span>
          </>
        );
        if (connected || demoReady) return (
          <button
            key={provider}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(provider)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-[#F1F3F5] focus-visible:bg-[#F1F3F5] focus-visible:outline-none"
            data-testid={`slash-integration-${provider}`}
          >
            {row}
          </button>
        );
        if (provider === "gmail") return (
          <Link key={provider} to="/integrations" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] hover:bg-[#F1F3F5] focus-visible:outline-[#111315]">
            {row}
          </Link>
        );
        return (
          <div key={provider} aria-disabled="true" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] opacity-65">
            {row}
          </div>
        );
      })}
    </div>
  );
}