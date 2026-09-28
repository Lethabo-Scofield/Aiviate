import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cable, ChevronDown, ChevronUp, ExternalLink, Globe2, RefreshCw, X } from "lucide-react";
import { siGmail, siQuickbooks, siSage, siShopify, siWhatsapp, siWoocommerce, siXero, siZoho } from "simple-icons";
import { getIntegrations } from "../services/api";

export const PROVIDERS = [
  { provider: "shopify", name: "Shopify", logo: siShopify },
  { provider: "woocommerce", name: "WooCommerce", logo: siWoocommerce },
  { provider: "whatsapp", name: "WhatsApp", logo: siWhatsapp },
  { provider: "teams", name: "Microsoft Teams" },
  { provider: "quickbooks", name: "QuickBooks", logo: siQuickbooks },
  { provider: "xero", name: "Xero", logo: siXero },
  { provider: "sage", name: "Sage", logo: siSage },
  { provider: "zoho", name: "Zoho", logo: siZoho },
  { provider: "olyxee", name: "Olyxee Logistics" },
  { provider: "custom-api", name: "Custom API" },
  { provider: "gmail", name: "Gmail", logo: siGmail },
];

export function ProviderLogo({ provider, size = 22 }) {
  const entry = PROVIDERS.find((item) => item.provider === provider);
  if (entry?.logo) return (
    <svg role="img" aria-label={`${entry.name} logo`} viewBox="0 0 24 24" width={size} height={size} fill={`#${entry.logo.hex}`}>
      <path d={entry.logo.path} />
    </svg>
  );
  if (provider === "teams") return (
    <svg role="img" aria-label="Microsoft Teams logo" viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="24.8" cy="10.1" r="3.5" fill="#7B83EB" />
      <path d="M19.2 15h10.4v7.3a5.2 5.2 0 0 1-10.4 0z" fill="#5059C9" />
      <circle cx="17.7" cy="8.9" r="4.6" fill="#5B5FC7" />
      <path d="M10 14h15.4v9a7.7 7.7 0 0 1-15.4 0z" fill="#7B83EB" />
      <rect x="3" y="11" width="15" height="15" rx="2" fill="#4B53BC" />
      <path d="M6.9 15.1h7.3v1.8h-2.6v6h-2v-6H6.9z" fill="#F6F7FF" />
    </svg>
  );
  if (provider === "custom-api") return <Globe2 size={size} strokeWidth={1.7} aria-label="Custom API" />;
  // No verified Olyxee logo is bundled. A plain wordmark avoids misrepresenting another brand.
  return <span aria-label="Olyxee Logistics" className="text-[10px] font-bold tracking-[-0.04em] text-[#263f4b]">Olyxee</span>;
}

export function useIntegrationCatalog() {
  const [catalog, setCatalog] = useState({ connections: [], demos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getIntegrations();
      setCatalog({ connections: data.connections || [], demos: data.demos || [] });
    } catch (err) {
      setError(err?.message || "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...catalog, loading, error, reload };
}

export default function IntegrationTools({ catalog, selected, onSelect, onGmailSearch, onDemoPrompt, open, onToggle, busy }) {
  const [gmailQuery, setGmailQuery] = useState("");
  const gmailConnection = catalog.connections.find((item) => item.provider === "gmail" && item.is_active !== false);
  const gmailConnected = Boolean(gmailConnection);
  const selectedDemo = (catalog.demos || []).find((item) => item.provider === selected);
  useEffect(() => {
    if (!catalog.loading && selected && !(selected === "gmail" ? gmailConnected : selectedDemo)) onSelect(null);
  }, [catalog.loading, gmailConnected, selectedDemo, selected, onSelect]);
  return (
    <div className="ops-tools mx-auto w-full max-w-[820px]">
      {open && (
        <section id="chat-tools-panel" aria-label="Available chat tools" className="ops-tools-panel mb-3 rounded-[18px] border border-[#dce2e5] bg-[#fdfdfc] p-3 shadow-[0_8px_30px_rgba(30,47,54,.08)] sm:p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-[#202a30]">Agent tools</h2>
               <p className="mt-0.5 text-[11px] text-[#68767c]">Explore sample services, or use your connected Gmail account.</p>
            </div>
            <button type="button" onClick={onToggle} aria-label="Close tools" data-testid="button-close-tools" className="rounded-lg p-1 text-[#68767c] hover:bg-[#eef1f1]"><X size={17} /></button>
          </div>
          {catalog.loading ? <div role="status" className="flex items-center gap-3 rounded-xl border border-[#e3e8e9] px-3 py-3 text-[12px] text-[#68767c]"><RefreshCw size={14} className="animate-spin" /> Checking connections…</div>
            : catalog.error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-[#f5ecea] p-3 text-[12px] text-[#793b34]">{catalog.error}<button type="button" onClick={catalog.reload} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={13} /> Retry</button></div>
              : gmailConnected ? (
                <button
                  type="button"
                  onClick={() => { onSelect("gmail"); onToggle(); }}
                  data-testid="button-tool-gmail"
                  aria-pressed={selected === "gmail"}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#e3e8e9] bg-white px-3 py-3 text-left transition-colors hover:bg-[#f4f6f6]"
                >
                  <ProviderLogo provider="gmail" size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-[#253138]">Gmail</span>
                    <span className="block truncate text-[11px] text-[#68767c]">{gmailConnection.provider_user_email || "Connected · inbox search"}</span>
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#467766]" aria-label="Connected" />
                </button>
              ) : (
                <Link to="/integrations" className="flex items-center gap-3 rounded-xl border border-[#e3e8e9] bg-white px-3 py-3 transition-colors hover:bg-[#f4f6f6]">
                  <ProviderLogo provider="gmail" size={22} />
                  <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-[#253138]">Gmail</span><span className="block text-[11px] text-[#68767c]">Connect your account to search email</span></span>
                  <ExternalLink size={14} className="text-[#68767c]" aria-hidden="true" />
                </Link>
              )}
          {!catalog.loading && !catalog.error && (catalog.demos || []).length > 0 && (
             <div className="mt-3 grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto border-t border-[#e3e8e9] pt-3 sm:grid-cols-2" aria-label="Sample integrations">
              {catalog.demos.map((demo) => (
                <button
                  key={demo.provider}
                  type="button"
                  onClick={() => { onSelect(demo.provider); onToggle(); }}
                  data-testid={`button-tool-${demo.provider}`}
                  aria-pressed={selected === demo.provider}
                  className="flex items-center gap-2.5 rounded-xl border border-[#e3e8e9] bg-white px-3 py-2.5 text-left transition-colors hover:bg-[#f4f6f6]"
                >
                  <ProviderLogo provider={demo.provider} size={19} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#253138]">{demo.name}</span>
                   <span className="shrink-0 text-[10px] text-[#68767c]">Sample</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 border-t border-[#e3e8e9] pt-3">
            <Link to="/integrations" data-testid="link-manage-integrations" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#315f70] hover:underline">Manage integrations <ExternalLink size={13} /></Link>
          </div>
        </section>
      )}
      {selected === "gmail" && gmailConnected && !open && (
        <div className="mb-3 rounded-[16px] border border-[#dce3e5] bg-[#fdfdfc] px-3 py-3 sm:px-4" data-testid="panel-selected-integration">
          <div className="flex items-center gap-2.5">
            <ProviderLogo provider="gmail" size={20} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-[#263239]">Gmail <span className="ml-1 font-medium text-[#718087]">· connected</span></p>
              <p className="text-[11px] text-[#718087]">Ask about your inbox, then review replies before sending.</p>
            </div>
            <button type="button" onClick={() => onSelect(null)} aria-label="Clear selected tool" data-testid="button-clear-tool" className="rounded-lg p-1 text-[#718087] hover:bg-[#eef1f1]"><X size={15} /></button>
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (gmailQuery.trim()) onGmailSearch(gmailQuery.trim()); }}>
            <input value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} aria-label="Search connected Gmail" data-testid="input-gmail-query" placeholder="Search connected Gmail" className="min-w-0 flex-1 rounded-lg border border-[#dbe2e4] bg-[#fafbfa] px-3 py-2 text-[12px] outline-none focus:border-[#547784]" />
            <button type="submit" disabled={busy || !gmailQuery.trim()} data-testid="button-search-gmail" className="rounded-lg bg-[#365965] px-3 py-2 text-[11px] font-semibold text-[#f9faf9] disabled:opacity-45">Search</button>
          </form>
          <button type="button" disabled={busy} onClick={() => onDemoPrompt("Check latest messages from /gmail and respond to suppliers")} className="mt-2 text-left text-[11px] font-medium text-[#365965] hover:underline disabled:opacity-50">Check latest Gmail messages and draft supplier replies</button>
        </div>
      )}
      {selectedDemo && !open && (
        <div className="mb-3 rounded-[16px] border border-[#dce3e5] bg-[#fdfdfc] px-3 py-3 sm:px-4" data-testid="panel-selected-integration">
          <div className="flex items-center gap-2.5">
            <ProviderLogo provider={selectedDemo.provider} size={20} />
            <div className="min-w-0 flex-1">
               <p className="text-[12px] font-bold text-[#263239]">{selectedDemo.name} <span className="ml-1 font-medium text-[#718087]">· Sample data</span></p>
              <p className="text-[11px] text-[#718087]">{selectedDemo.description} No live account is connected.</p>
            </div>
            <button type="button" onClick={() => onSelect(null)} aria-label="Clear selected tool" data-testid="button-clear-tool" className="rounded-lg p-1 text-[#718087] hover:bg-[#eef1f1]"><X size={15} /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(selectedDemo.prompts || []).map((prompt, index) => (
              <button key={prompt} type="button" disabled={busy} onClick={() => onDemoPrompt(prompt)} data-testid={`button-demo-prompt-${index}`} className="rounded-lg border border-[#dce3e5] bg-white px-2.5 py-1.5 text-left text-[11px] text-[#40565f] hover:bg-[#eef1f1] disabled:opacity-50">
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="chat-tools-panel" data-testid="button-toggle-tools" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#40565f] hover:bg-[#edf1f2]">
        <Cable size={14} /> Tools <kbd className="rounded border border-[#DEE2E6] px-1 text-[10px] font-normal">/</kbd> {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
    </div>
  );
}