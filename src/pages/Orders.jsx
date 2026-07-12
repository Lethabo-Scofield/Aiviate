import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ShoppingBag, RefreshCw, Zap, AlertTriangle, CheckCircle, MapPin, Plug, Search,
} from "lucide-react";
import { Spinner } from "../components/Loader";
import { getStoreOrders, importStoreOrders } from "../services/api";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "imported", label: "Imported" },
];

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function fmtMoney(n) {
  return `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ order }) {
  if (order.imported) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] font-semibold whitespace-nowrap">Imported</span>;
  }
  if (!order.importable) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ff9500]/10 text-[#ff9500] font-semibold whitespace-nowrap">No address</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#008080]/10 text-[#008080] font-semibold whitespace-nowrap">New</span>;
}

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const load = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");
      const res = await getStoreOrders();
      setConfigured(!!res.configured);
      setOrders(res.orders || []);
    } catch (e) {
      setError(e.message || "Could not load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const list = orders || [];
    return {
      total: list.length,
      fresh: list.filter((o) => !o.imported && o.importable).length,
      imported: list.filter((o) => o.imported).length,
      noAddress: list.filter((o) => !o.imported && !o.importable).length,
    };
  }, [orders]);

  const visible = useMemo(() => {
    let list = orders || [];
    if (filter === "new") list = list.filter((o) => !o.imported && o.importable);
    if (filter === "imported") list = list.filter((o) => o.imported);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        `${o.id} ${o.customer_name} ${o.shipping_address} ${o.item_summary}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filter, query]);

  const handleImportAndOptimize = async () => {
    setImporting(true);
    setError("");
    try {
      const result = await importStoreOrders();
      await load(true);
      if ((result.imported || 0) === 0 && (result.skipped?.length || 0) === 0) {
        setError("No orders could be imported. Check that orders have shipping addresses.");
        return;
      }
      navigate("/jobs?tab=dispatch&mode=optimize");
    } catch (e) {
      setError(e.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Orders</h1>
          <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
            Live orders from your connected store, ready to dispatch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="apple-btn apple-btn-secondary text-[13px] py-2 px-3.5"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Sync
          </button>
          <button
            onClick={handleImportAndOptimize}
            disabled={importing || counts.fresh === 0}
            className="apple-btn apple-btn-primary text-[13px] py-2 px-4"
          >
            {importing ? (
              <><Spinner size={14} /> Importing...</>
            ) : (
              <><Zap size={14} /> Import {counts.fresh > 0 ? counts.fresh : ""} &amp; optimize</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="apple-card p-4 flex items-center gap-3 mb-5 border border-[#ff3b30]/20">
          <AlertTriangle size={16} className="text-[#ff3b30] shrink-0" />
          <p className="text-[13px] text-[#111315]">{error}</p>
        </div>
      )}

      {!configured && !loading ? (
        <div className="apple-card p-10 text-center max-w-xl">
          <div className="w-12 h-12 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-4">
            <Plug size={20} className="text-[#868E96]" strokeWidth={1.8} />
          </div>
          <h2 className="text-[16px] font-semibold text-[#111315] mb-1.5">No store connected</h2>
          <p className="text-[13px] text-[#868E96] mb-5">
            Connect your e-commerce store to see orders here and dispatch them in one click.
          </p>
          <Link to="/integrations" className="apple-btn apple-btn-primary text-[13px] py-2 px-4 inline-flex">
            Go to Integrations
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total orders", value: counts.total, tone: "text-[#111315]" },
              { label: "New", value: counts.fresh, tone: "text-[#008080]" },
              { label: "Imported", value: counts.imported, tone: "text-[#34c759]" },
              { label: "Missing address", value: counts.noAddress, tone: "text-[#ff9500]" },
            ].map((s) => (
              <div key={s.label} className="apple-card p-4">
                <p className={`text-[22px] font-semibold ${s.tone}`}>{loading ? "–" : s.value}</p>
                <p className="text-[11px] text-[#868E96] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F1F3F5] self-start">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    filter === f.id ? "bg-white text-[#111315] shadow-sm" : "text-[#868E96] hover:text-[#111315]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ADB5BD]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search orders..."
                className="apple-input w-full pl-9 text-[13px]"
              />
            </div>
          </div>

          {loading ? (
            <div className="apple-card p-12 text-center"><Spinner size={22} className="mx-auto" /></div>
          ) : visible.length === 0 ? (
            <div className="apple-card p-10 text-center">
              <ShoppingBag size={20} className="text-[#DEE2E6] mx-auto mb-3" />
              <p className="text-[13px] text-[#868E96]">
                {query || filter !== "all" ? "No orders match your filter." : "No orders in your store yet."}
              </p>
            </div>
          ) : (
            <div className="apple-card divide-y divide-black/[0.06]">
              {visible.map((o) => (
                <div key={o.id} className="px-4 sm:px-5 py-3.5 flex items-start gap-3 sm:gap-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-[#fafafa] transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-[#008080]/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <ShoppingBag size={15} className="text-[#008080]" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] font-semibold text-[#111315]">
                        {o.customer_name || "Unknown customer"}
                      </p>
                      <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#F1F3F5] text-[#868E96] font-mono font-medium">#{o.id}</span>
                      <StatusBadge order={o} />
                      {o.payment_status === "paid" && (
                        <span className="text-[10px] text-[#34c759] font-medium inline-flex items-center gap-0.5">
                          <CheckCircle size={10} /> Paid
                        </span>
                      )}
                    </div>
                    {o.shipping_address ? (
                      <p className="text-[12px] text-[#868E96] mt-1 flex items-center gap-1 truncate">
                        <MapPin size={11} className="shrink-0 text-[#ADB5BD]" /> {o.shipping_address}
                      </p>
                    ) : (
                      <p className="text-[12px] text-[#ff9500] mt-1">No shipping address on this order</p>
                    )}
                    {o.item_summary && (
                      <p className="text-[11.5px] text-[#ADB5BD] mt-0.5 truncate">{o.item_summary}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-semibold text-[#111315]">{fmtMoney(o.total)}</p>
                    <p className="text-[10.5px] text-[#ADB5BD] mt-0.5 whitespace-nowrap">{fmtDate(o.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
