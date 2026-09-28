import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag, RefreshCw, ArrowRight, Lock,
  Pencil, Check, X, ImagePlus, Trash2, Code2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Spinner } from "../components/Loader";
import { ProviderLogo } from "../components/IntegrationTools";
import { setPendingAsk } from "../lib/askBus";
import {
  API_BASE,
  completeGmailAuth,
  disconnectIntegration,
  getGmailAuthUrl,
  getIntegrations,
  getStoreOrders,
  getStoreIntegration,
  updateStoreIntegration,
} from "../services/api";

const LOGO_SIZE = 128;

function fileToLogoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, LOGO_SIZE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

export default function Integrations({ onTryDemo }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // { configured, orderCount, newCount, checkedAt }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branding, setBranding] = useState({ display_name: null, logo: null });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftLogo, setDraftLogo] = useState(null); // null = keep, "" = remove, string = new
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [showDevGuide, setShowDevGuide] = useState(false);
  const [gmailConnection, setGmailConnection] = useState(null);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [gmailLoading, setGmailLoading] = useState(true);
  const [demoCatalog, setDemoCatalog] = useState([]);
  const [expandedDemo, setExpandedDemo] = useState(null);
  const fileRef = useRef(null);

  const check = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const res = await getStoreOrders();
      const orders = res.orders || [];
      setStatus({
        configured: true,
        orderCount: orders.length,
        newCount: orders.filter((o) => !o.imported && o.importable).length,
        checkedAt: new Date(),
      });
    } catch {
      setStatus({ configured: false, orderCount: 0, newCount: 0, checkedAt: new Date() });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    check();
    getStoreIntegration()
      .then((res) => {
        if (res.settings) setBranding({ display_name: res.settings.display_name, logo: res.settings.logo });
      })
      .catch(() => {});
    getIntegrations()
      .then((res) => {
        const gmail = (res.connections || []).find((connection) => connection.provider === "gmail" && connection.is_active !== false);
        setGmailConnection(gmail || null);
        setDemoCatalog(res.demos || []);
        setConnectionError("");
      })
      .catch(() => {
        setGmailConnection(null);
        setConnectionError("Could not check connected services. Refresh and try again.");
      })
      .finally(() => setGmailLoading(false));

    const gmailRedirectUri = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/integrations`;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      setEditError(`Google OAuth failed: ${oauthError}`);
      window.history.replaceState({}, "", gmailRedirectUri);
      return;
    }

    if (!code) return;

    (async () => {
      try {
        const res = await completeGmailAuth({ code, state, redirect_uri: gmailRedirectUri });
        setGmailConnection(res.connection || { provider: "gmail", display_name: "Gmail" });
        window.history.replaceState({}, "", gmailRedirectUri);
      } catch (err) {
        setEditError(err.message || "Google OAuth did not finish successfully");
      }
    })();
  }, []);

  const storeName = branding.display_name || "Aiviate Operational Store";
  const tryDemo = (demo, promptIndex = 0) => {
    const prompt = demo.prompts?.[promptIndex] || `Show me ${demo.name} sample records`;
    if (onTryDemo) onTryDemo(prompt);
    else {
      setPendingAsk(prompt);
      navigate("/");
    }
  };

  const startEdit = () => {
    setDraftName(branding.display_name || "");
    setDraftLogo(null);
    setEditError("");
    setEditing(true);
  };

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setEditError("Please choose an image file");
      return;
    }
    try {
      setEditError("");
      setDraftLogo(await fileToLogoDataUrl(file));
    } catch {
      setEditError("Could not read that image — try a different file");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setEditError("");
    try {
      const payload = { display_name: draftName.trim() };
      if (draftLogo !== null) payload.logo = draftLogo;
      const res = await updateStoreIntegration(payload);
      setBranding({ display_name: res.settings.display_name, logo: res.settings.logo });
      setEditing(false);
    } catch (err) {
      setEditError(err.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const previewLogo = draftLogo === "" ? null : (draftLogo ?? branding.logo);

  const handleConnectGmail = async () => {
    try {
      setGmailConnecting(true);
      const redirect_uri = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/integrations`;
      const res = await getGmailAuthUrl({ redirect_uri });
      window.location.assign(res.url);
    } catch (err) {
      setEditError(err.message || "Could not start Gmail connection");
    } finally {
      setGmailConnecting(false);
    }
  };

  const handleDisconnectGmail = async () => {
    try {
      setGmailDisconnecting(true);
      await disconnectIntegration("gmail");
      setGmailConnection(null);
    } catch (err) {
      setEditError(err.message || "Could not disconnect Gmail");
    } finally {
      setGmailDisconnecting(false);
    }
  };

  return (
    <div className="animate-fade-in w-full max-w-[1200px]">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Integrations</h1>
        <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
          Explore other services with sample data. Gmail can use a connected account for real inbox search.
        </p>
      </div>

      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#868E96] mb-2">Built-in order source</p>

      {loading ? (
        <div className="apple-card p-10 text-center mb-8"><Spinner size={22} className="mx-auto" /></div>
      ) : (
        <div className="apple-card p-5 sm:p-6 mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {editing ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-11 h-11 rounded-2xl bg-[#111315]/10 flex items-center justify-center shrink-0 relative overflow-hidden group border border-dashed border-[#111315]/40 hover:border-[#111315] transition-colors"
                  title="Upload logo"
                >
                  {previewLogo ? (
                    <img src={previewLogo} alt="Store logo" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus size={17} className="text-[#111315]" strokeWidth={1.8} />
                  )}
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ImagePlus size={15} className="text-white" strokeWidth={2} />
                  </span>
                </button>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[#111315]/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {branding.logo ? (
                    <img src={branding.logo} alt="Store logo" className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag size={19} className="text-[#111315]" strokeWidth={1.8} />
                  )}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoFile} />
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Aiviate Operational Store"
                      maxLength={80}
                      autoFocus
                      className="w-full max-w-xs px-3 py-1.5 rounded-lg border border-black/[0.1] text-[14px] font-semibold text-[#111315] focus:outline-none focus:border-[#111315] focus:ring-2 focus:ring-[#111315]/15"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={handleSave} disabled={saving} className="apple-btn apple-btn-primary text-[12px] py-1.5 px-3">
                        {saving ? <Spinner size={12} /> : <Check size={13} />} Save
                      </button>
                      <button onClick={() => setEditing(false)} disabled={saving} className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3">
                        <X size={13} /> Cancel
                      </button>
                      {previewLogo && (
                        <button
                          onClick={() => setDraftLogo("")}
                          disabled={saving}
                          className="inline-flex items-center gap-1 text-[11.5px] text-[#868E96] hover:text-[#343A40] transition-colors"
                        >
                          <Trash2 size={12} /> Remove logo
                        </button>
                      )}
                    </div>
                    {editError && <p className="text-[11.5px] text-[#343A40]">{editError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[15px] font-semibold text-[#111315]">{storeName}</h2>
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] px-2 py-0.5 rounded-full bg-[#5C636A]/10 text-[#5C636A] font-semibold">
                      {status?.configured ? "Built-in" : "Could not check"}
                    </span>
                  </div>
                )}
                {!editing && (
                  <>
                    <p className="text-[12px] text-[#868E96] mt-1">
                      Default order source · tenant-scoped operational records
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {["Aiviate", "Orders", "Tenant scoped"].map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-[#F1F3F5] text-[#868E96] font-mono font-medium">{t}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!editing && (
                <button
                  onClick={startEdit}
                  className="w-8 h-8 rounded-lg hover:bg-[#F1F3F5] flex items-center justify-center transition-colors"
                  title="Edit name & logo"
                >
                  <Pencil size={14} className="text-[#868E96]" />
                </button>
              )}
              <button
                onClick={() => check(true)}
                disabled={refreshing}
                className="w-8 h-8 rounded-lg hover:bg-[#F1F3F5] flex items-center justify-center transition-colors"
                title="Check connection"
              >
                <RefreshCw size={14} className={`text-[#868E96] ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-[#F1F3F5] rounded-xl p-3 text-center">
              <p className="text-[17px] font-semibold text-[#111315]">{status.orderCount}</p>
              <p className="text-[10.5px] text-[#868E96] mt-0.5">Orders synced</p>
            </div>
            <div className="bg-[#F1F3F5] rounded-xl p-3 text-center">
              <p className="text-[17px] font-semibold text-[#111315]">{status.newCount}</p>
              <p className="text-[10.5px] text-[#868E96] mt-0.5">Ready to dispatch</p>
            </div>
            <div className="bg-[#F1F3F5] rounded-xl p-3 text-center">
              <p className="text-[17px] font-semibold text-[#111315]">
                {status.checkedAt?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-[10.5px] text-[#868E96] mt-0.5">Last checked</p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-black/[0.06]">
            <p className="text-[11px] text-[#ADB5BD] inline-flex items-center gap-1.5">
              <Lock size={11} /> Available by default for every account
            </p>
            <Link to="/orders" className="apple-btn apple-btn-primary text-[13px] py-2 px-4">
              View orders <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}

      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#868E96] mb-2">Third-party connections</p>
      {connectionError && <p role="alert" className="text-[12px] text-[#A61E4D] mb-3">{connectionError}</p>}
      <div className="apple-card p-4 sm:p-5 mb-6">
        <div className="flex items-start gap-3">
          <ProviderLogo provider="gmail" size={25} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-[#111315]">Gmail</h2>
            <p className="mt-1 text-[12px] text-[#868E96]">
              {gmailLoading ? "Checking connection…" : gmailConnection
                ? `Connected${gmailConnection.provider_user_email ? ` as ${gmailConnection.provider_user_email}` : ""} · search your inbox from chat`
                : "Connect your Google account to search its inbox from chat."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={handleConnectGmail}
              disabled={gmailLoading || gmailConnecting || gmailDisconnecting}
              className="text-[12px] font-semibold text-[#111315] hover:underline disabled:opacity-50"
            >
              {gmailConnecting ? "Connecting…" : gmailConnection ? "Reconnect" : "Connect"}
            </button>
            {gmailConnection && (
              <button onClick={handleDisconnectGmail} disabled={gmailDisconnecting || gmailConnecting} className="text-[12px] text-[#868E96] hover:text-[#111315] disabled:opacity-50">
                {gmailDisconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </div>
        </div>
      </div>
      <section className="mb-8" aria-label="Integration previews">
        <div className="mb-3">
          <h2 className="text-[15px] font-semibold text-[#111315]">Explore integrations</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[#868E96]">These previews use sample records, not connected external accounts. You can explore them with the agent; nothing is sent or changed.</p>
        </div>
        {gmailLoading ? <div role="status" className="apple-card p-5 text-[12px] text-[#868E96]">Loading services…</div>
          : demoCatalog.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {demoCatalog.map((demo) => (
                <div key={demo.provider} className="apple-card p-4" data-testid={`card-demo-${demo.provider}`}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5]"><ProviderLogo provider={demo.provider} size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[13px] font-semibold text-[#111315]">{demo.name}</h3>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#868E96]">{demo.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => tryDemo(demo)} data-testid={`button-try-demo-${demo.provider}`} className="apple-btn apple-btn-primary px-3 py-1.5 text-[12px]">
                      Try with agent <ArrowRight size={13} />
                    </button>
                    <button type="button" onClick={() => setExpandedDemo((current) => current === demo.provider ? null : demo.provider)} aria-expanded={expandedDemo === demo.provider} data-testid={`button-preview-demo-${demo.provider}`} className="apple-btn apple-btn-secondary px-3 py-1.5 text-[12px]">
                      {expandedDemo === demo.provider ? "Hide sample" : "Preview sample"}
                    </button>
                  </div>
                  {expandedDemo === demo.provider && (
                    <div className="mt-3 space-y-2 border-t border-black/[0.06] pt-3" data-testid={`preview-demo-${demo.provider}`}>
                      {demo.records.map((item) => (
                        <div key={item.label} className="flex items-start justify-between gap-3 rounded-lg bg-[#F8F9FA] px-3 py-2 text-[11px]">
                          <div className="min-w-0"><p className="font-semibold text-[#111315]">{item.label}</p><p className="text-[#5C636A]">{item.detail}</p></div>
                          <span className="shrink-0 text-[#868E96]">{item.meta}</span>
                        </div>
                      ))}
                      {demo.prompts?.[1] && <button type="button" onClick={() => tryDemo(demo, 1)} className="text-[11px] font-medium text-[#111315] hover:underline">Explore a sample issue →</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <p role="status" className="apple-card p-5 text-[12px] text-[#868E96]">Service previews could not load. Please refresh and try again.</p>}
      </section>

      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#868E96] mb-2">Built-in developer API · not a third-party connection</p>
      <div className="apple-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[#111315] flex items-center justify-center shrink-0">
            <Code2 size={19} className="text-white" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[#111315]">Developer integration</h2>
            <p className="text-[12px] text-[#868E96] mt-1 leading-snug">
              Import your own orders through Aiviate's built-in REST API. This is separate from
              external account connections and does not connect to a third-party service.
            </p>
            <button
              onClick={() => setShowDevGuide((v) => !v)}
              className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3 mt-3"
            >
              {showDevGuide ? <>Hide instructions <ChevronUp size={13} /></> : <>View instructions <ChevronDown size={13} /></>}
            </button>
          </div>
        </div>

        {showDevGuide && (
          <div className="mt-5 pt-5 border-t border-black/[0.06] space-y-4">
            <div>
              <p className="text-[12px] font-semibold text-[#111315] mb-1.5">1 · Get an access token</p>
              <p className="text-[11.5px] text-[#868E96] mb-2">Log in with an admin account — the response includes a token to use in the next step.</p>
              <pre className="bg-[#111315] text-[#E9ECEF] text-[11px] leading-relaxed rounded-xl p-3.5 overflow-x-auto font-mono">{`curl -X POST ${API_BASE}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@company.com", "password": "•••"}'`}</pre>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#111315] mb-1.5">2 · Push your orders as a CSV</p>
              <p className="text-[11.5px] text-[#868E96] mb-2">
                Export orders from your system as a CSV with an <span className="font-mono text-[10.5px] bg-[#F1F3F5] px-1 py-0.5 rounded">address</span> column
                (optionally <span className="font-mono text-[10.5px] bg-[#F1F3F5] px-1 py-0.5 rounded">order_id</span>, <span className="font-mono text-[10.5px] bg-[#F1F3F5] px-1 py-0.5 rounded">customer_name</span>, <span className="font-mono text-[10.5px] bg-[#F1F3F5] px-1 py-0.5 rounded">phone</span>, <span className="font-mono text-[10.5px] bg-[#F1F3F5] px-1 py-0.5 rounded">notes</span>) and upload it.
                Addresses are geocoded automatically.
              </p>
              <pre className="bg-[#111315] text-[#E9ECEF] text-[11px] leading-relaxed rounded-xl p-3.5 overflow-x-auto font-mono">{`curl -X POST ${API_BASE}/upload \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "file=@orders.csv"`}</pre>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#111315] mb-1.5">3 · Optimize & dispatch</p>
              <p className="text-[11.5px] text-[#868E96]">
                The uploaded orders appear on the <Link to="/jobs?tab=dispatch" className="text-[#111315] font-medium hover:underline">Jobs page</Link> ready
                to be optimized into routes — or trigger it from code with <span className="font-mono text-[10.5px] bg-[#F1F3F5] px-1 py-0.5 rounded">POST /api/optimize</span>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
