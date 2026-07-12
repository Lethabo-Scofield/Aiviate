import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plug, ShoppingBag, RefreshCw, ArrowRight, Globe, Store, Package, Lock,
  Pencil, Check, X, ImagePlus, Trash2,
} from "lucide-react";
import { Spinner } from "../components/Loader";
import { getStoreOrders, getStoreIntegration, updateStoreIntegration } from "../services/api";

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

const AVAILABLE = [
  { name: "Shopify", desc: "Pull orders straight from your Shopify store.", Icon: Store },
  { name: "WooCommerce", desc: "Sync WooCommerce orders automatically.", Icon: Package },
  { name: "Custom API", desc: "Connect any REST endpoint that serves orders.", Icon: Globe },
];

export default function Integrations() {
  const [status, setStatus] = useState(null); // { configured, orderCount, newCount, checkedAt }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branding, setBranding] = useState({ display_name: null, logo: null });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftLogo, setDraftLogo] = useState(null); // null = keep, "" = remove, string = new
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const fileRef = useRef(null);

  const check = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const res = await getStoreOrders();
      const orders = res.orders || [];
      setStatus({
        configured: !!res.configured,
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
  }, []);

  const storeName = branding.display_name || "Storefront Orders API";

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

  return (
    <div className="animate-fade-in max-w-3xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Integrations</h1>
        <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
          Connect the systems your orders live in, and Aiviate turns them into optimized routes.
        </p>
      </div>

      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#868E96] mb-2">Connected</p>

      {loading ? (
        <div className="apple-card p-10 text-center mb-8"><Spinner size={22} className="mx-auto" /></div>
      ) : status?.configured ? (
        <div className="apple-card p-5 sm:p-6 mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {editing ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-11 h-11 rounded-2xl bg-[#008080]/10 flex items-center justify-center shrink-0 relative overflow-hidden group border border-dashed border-[#008080]/40 hover:border-[#008080] transition-colors"
                  title="Upload logo"
                >
                  {previewLogo ? (
                    <img src={previewLogo} alt="Store logo" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus size={17} className="text-[#008080]" strokeWidth={1.8} />
                  )}
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ImagePlus size={15} className="text-white" strokeWidth={2} />
                  </span>
                </button>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[#008080]/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {branding.logo ? (
                    <img src={branding.logo} alt="Store logo" className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag size={19} className="text-[#008080]" strokeWidth={1.8} />
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
                      placeholder="Storefront Orders API"
                      maxLength={80}
                      autoFocus
                      className="w-full max-w-xs px-3 py-1.5 rounded-lg border border-black/[0.1] text-[14px] font-semibold text-[#111315] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15"
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
                          className="inline-flex items-center gap-1 text-[11.5px] text-[#868E96] hover:text-[#ff3b30] transition-colors"
                        >
                          <Trash2 size={12} /> Remove logo
                        </button>
                      )}
                    </div>
                    {editError && <p className="text-[11.5px] text-[#ff3b30]">{editError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[15px] font-semibold text-[#111315]">{storeName}</h2>
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
                      Connected
                    </span>
                  </div>
                )}
                {!editing && (
                  <>
                    <p className="text-[12px] text-[#868E96] mt-1">
                      Your e-commerce store · read-only order sync
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {["REST", "Orders", "Read-only"].map((t) => (
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
              <p className="text-[17px] font-semibold text-[#008080]">{status.newCount}</p>
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
              <Lock size={11} /> Credentials stored securely as an environment secret
            </p>
            <Link to="/orders" className="apple-btn apple-btn-primary text-[13px] py-2 px-4">
              View orders <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="apple-card p-8 text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-3">
            <Plug size={20} className="text-[#868E96]" strokeWidth={1.8} />
          </div>
          <p className="text-[13px] text-[#868E96]">
            Nothing connected yet. Ask your team to add your store's connection details.
          </p>
        </div>
      )}

      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#868E96] mb-2">Available</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {AVAILABLE.map(({ name, desc, Icon }) => (
          <div key={name} className="apple-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#F1F3F5] flex items-center justify-center">
                <Icon size={15} className="text-[#111315]" strokeWidth={1.8} />
              </div>
              <p className="text-[13px] font-semibold text-[#111315]">{name}</p>
            </div>
            <p className="text-[11.5px] text-[#868E96] leading-snug mb-2.5">{desc}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1F3F5] text-[#ADB5BD] font-semibold">Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}
