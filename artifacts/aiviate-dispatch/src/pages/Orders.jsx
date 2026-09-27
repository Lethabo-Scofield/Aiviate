import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, RefreshCw, Zap, AlertTriangle, CheckCircle, MapPin, Search,
  ChevronDown, Phone, Mail, Package, CreditCard, Clock,
} from "lucide-react";
import { Spinner } from "../components/Loader";
import { getStoreOrders, importStoreOrders } from "../services/api";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "imported", label: "Imported" },
  { id: "attention", label: "Needs attention" },
];

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function fmtRelative(iso) {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return "";
  }
}

function fmtMoney(n) {
  return `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Widget x2, Gadget x1" -> [{name: "Widget", qty: 2}, {name: "Gadget", qty: 1}] */
function parseItems(summary) {
  if (!summary) return [];
  return summary
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*) x(\d+)$/);
      return m ? { name: m[1], qty: Number(m[2]) } : { name: part, qty: 1 };
    });
}

function StatusBadge({ order }) {
  if (order.imported) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#5C636A]/10 text-[#5C636A] font-semibold whitespace-nowrap">Imported</span>;
  }
  if (!order.importable) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#868E96]/10 text-[#868E96] font-semibold whitespace-nowrap">No address</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#111315]/10 text-[#111315] font-semibold whitespace-nowrap">New</span>;
}

function statusExplainer(order) {
  if (order.imported) return "This order is already in your dispatch queue as a delivery stop.";
  if (!order.importable) return "This order can't be dispatched until it has a shipping address.";
  return "Ready to import — it will become a delivery stop you can assign to a driver.";
}

function pct(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / total) * 100);
}

function OrdersFlow({ counts, loading }) {
  const total = counts.total || 0;
  const segments = [
    { key: "fresh", label: "New", value: counts.fresh, className: "bg-[#111315]" },
    { key: "imported", label: "Imported", value: counts.imported, className: "bg-[#5C636A]" },
    { key: "noAddress", label: "Missing address", value: counts.noAddress, className: "bg-[#ADB5BD]" },
  ];
  const maxValue = Math.max(...segments.map((s) => s.value), 1);

  return (
    <div className="apple-card mb-6 overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b border-black/[0.06] p-5 lg:border-b-0 lg:border-r">
          <p className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold">Order flow</p>
          <div className="mt-4 flex items-end gap-3">
            <p className="text-[44px] font-semibold leading-none tracking-tight text-[#111315] tabular-nums">
              {loading ? "–" : total}
            </p>
            <p className="pb-1.5 text-[13px] text-[#868E96]">live store orders</p>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-[#5C636A]">
            See what is ready for dispatch, what already moved into route planning, and what still needs clean delivery information.
          </p>
        </div>

        <div className="p-5">
          <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-[#F1F3F5]">
            {segments.map((segment) => {
              const width = total ? Math.max(pct(segment.value, total), segment.value ? 4 : 0) : 0;
              return (
                <div
                  key={segment.key}
                  className={`${segment.className} transition-all duration-500`}
                  style={{ width: `${width}%` }}
                  title={`${segment.label}: ${segment.value}`}
                />
              );
            })}
          </div>

          <div className="grid gap-3">
            {segments.map((segment) => {
              const percentage = pct(segment.value, total);
              return (
                <button
                  key={segment.key}
                  onClick={() => {
                    if (segment.key === "fresh") document.querySelector("[data-filter='new']")?.click();
                    if (segment.key === "imported") document.querySelector("[data-filter='imported']")?.click();
                    if (segment.key === "noAddress") document.querySelector("[data-filter='attention']")?.click();
                  }}
                  className="group grid grid-cols-[88px_1fr_54px] items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-[#E9ECEF] hover:bg-[#F8F9FA]"
                >
                  <div>
                    <p className="text-[13px] font-medium text-[#111315]">{loading ? "–" : segment.value}</p>
                    <p className="text-[11px] text-[#868E96]">{segment.label}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#F1F3F5]">
                    <div
                      className={`h-full rounded-full ${segment.className} transition-all duration-500`}
                      style={{ width: `${loading ? 0 : Math.max((segment.value / maxValue) * 100, segment.value ? 6 : 0)}%` }}
                    />
                  </div>
                  <p className="text-right text-[12px] font-medium tabular-nums text-[#5C636A]">
                    {loading ? "–" : `${percentage}%`}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingId, setImportingId] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();

  const load = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");
      const res = await getStoreOrders();
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
    if (filter === "attention") list = list.filter((o) => !o.imported && !o.importable);
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

  const handleImportOne = async (order) => {
    setImportingId(order.id);
    setError("");
    try {
      const result = await importStoreOrders([order.id]);
      await load(true);
      if ((result.imported || 0) === 0) {
        const reason = result.failed?.[0]?.reason || result.skipped?.[0]?.reason;
        setError(reason ? `Order #${order.id}: ${reason}` : `Order #${order.id} could not be imported.`);
      }
    } catch (e) {
      setError(e.message || "Import failed.");
    } finally {
      setImportingId(null);
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
            disabled={importing || importingId !== null || counts.fresh === 0}
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
        <div className="apple-card p-4 flex items-center gap-3 mb-5 border border-[#343A40]/20">
          <AlertTriangle size={16} className="text-[#343A40] shrink-0" />
          <p className="text-[13px] text-[#111315]">{error}</p>
        </div>
      )}

      <>
          <OrdersFlow counts={counts} loading={loading} />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F1F3F5] self-start">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  data-filter={f.id}
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
            <div className="space-y-2.5">
              {visible.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  expanded={expandedId === o.id}
                  onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
                  onImport={() => handleImportOne(o)}
                  importingThis={importingId === o.id}
                  importingAny={importing || importingId !== null}
                />
              ))}
            </div>
          )}
      </>
    </div>
  );
}

function OrderCard({ order: o, expanded, onToggle, onImport, importingThis, importingAny }) {
  const items = parseItems(o.item_summary);

  return (
    <div className="apple-card overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3 sm:gap-4 hover:bg-[#fafafa] transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-[#111315]/[0.06] flex items-center justify-center shrink-0">
          <ShoppingBag size={15} className="text-[#111315]" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13.5px] font-semibold text-[#111315]">
              {o.customer_name || "Unknown customer"}
            </p>
            <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#F1F3F5] text-[#868E96] font-mono font-medium">#{o.id}</span>
            <StatusBadge order={o} />
          </div>
          <p className="text-[12px] text-[#868E96] mt-0.5 truncate">
            {o.item_count > 0 ? `${o.item_count} item${o.item_count === 1 ? "" : "s"}` : "No items"}
            {o.shipping_address ? ` · ${o.shipping_address}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0 hidden xs:block sm:block">
          <p className="text-[13px] font-semibold text-[#111315]">{fmtMoney(o.display_total ?? o.total)}</p>
          <p className="text-[10.5px] text-[#ADB5BD] mt-0.5 whitespace-nowrap">{fmtRelative(o.created_at)}</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-[#c7c7cc] shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-black/[0.06] px-4 sm:px-5 py-4 bg-[#fcfcfd]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Items */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold mb-2 flex items-center gap-1.5">
                <Package size={12} /> Items
              </p>
              {items.length === 0 ? (
                <p className="text-[12.5px] text-[#868E96]">No item details on this order.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((it, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="text-[#111315] truncate">{it.name}</span>
                      <span className="text-[#868E96] font-medium shrink-0">×{it.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-black/[0.06]">
                <span className="text-[12.5px] text-[#868E96]">Order total</span>
                <span className="text-[13px] font-semibold text-[#111315]">{fmtMoney(o.display_total ?? o.total)}</span>
              </div>
            </div>

            {/* Delivery & contact */}
            <div className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Delivery
                </p>
                {o.shipping_address ? (
                  <p className="text-[12.5px] text-[#111315] leading-relaxed">{o.shipping_address}</p>
                ) : (
                  <p className="text-[12.5px] text-[#868E96]">No shipping address on this order</p>
                )}
              </div>
              <div className="space-y-1.5">
                {o.customer_phone && (
                  <p className="text-[12.5px] text-[#111315] flex items-center gap-2">
                    <Phone size={12} className="text-[#ADB5BD] shrink-0" /> {o.customer_phone}
                  </p>
                )}
                {o.customer_email && (
                  <p className="text-[12.5px] text-[#111315] flex items-center gap-2 truncate">
                    <Mail size={12} className="text-[#ADB5BD] shrink-0" /> {o.customer_email}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                <span className="text-[11.5px] text-[#868E96] inline-flex items-center gap-1.5">
                  <Clock size={11} className="text-[#ADB5BD]" /> {fmtDate(o.created_at)}
                </span>
                <span className={`text-[11.5px] inline-flex items-center gap-1.5 font-medium ${
                  o.payment_status === "paid" ? "text-[#5C636A]" : "text-[#868E96]"
                }`}>
                  <CreditCard size={11} className={o.payment_status === "paid" ? "text-[#5C636A]" : "text-[#ADB5BD]"} />
                  {o.payment_status === "paid" ? "Paid" : (o.payment_status || "Payment status unknown")}
                </span>
              </div>
            </div>
          </div>

          {/* Footer: status explainer + action */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4 pt-3.5 border-t border-black/[0.06]">
            <p className="text-[12px] text-[#868E96] flex-1 flex items-center gap-1.5">
              {o.imported && <CheckCircle size={12} className="text-[#5C636A] shrink-0" />}
              {statusExplainer(o)}
            </p>
            {!o.imported && o.importable && (
              <button
                onClick={(e) => { e.stopPropagation(); onImport(); }}
                disabled={importingAny}
                className="apple-btn apple-btn-secondary text-[12.5px] py-1.5 px-3.5 self-start sm:self-auto"
              >
                {importingThis ? <><Spinner size={12} /> Importing...</> : "Import this order"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
