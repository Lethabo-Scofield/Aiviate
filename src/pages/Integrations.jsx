import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plug, ShoppingBag, RefreshCw, ArrowRight, Globe, Store, Package, Lock,
} from "lucide-react";
import { Spinner } from "../components/Loader";
import { getStoreOrders } from "../services/api";

const AVAILABLE = [
  { name: "Shopify", desc: "Pull orders straight from your Shopify store.", Icon: Store },
  { name: "WooCommerce", desc: "Sync WooCommerce orders automatically.", Icon: Package },
  { name: "Custom API", desc: "Connect any REST endpoint that serves orders.", Icon: Globe },
];

export default function Integrations() {
  const [status, setStatus] = useState(null); // { configured, orderCount, newCount, checkedAt }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => { check(); }, []);

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
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-[#008080]/10 flex items-center justify-center shrink-0">
                <ShoppingBag size={19} className="text-[#008080]" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[15px] font-semibold text-[#111315]">Storefront Orders API</h2>
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
                    Connected
                  </span>
                </div>
                <p className="text-[12px] text-[#868E96] mt-1">
                  Your e-commerce store · read-only order sync
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {["REST", "Orders", "Read-only"].map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-[#F1F3F5] text-[#868E96] font-mono font-medium">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => check(true)}
              disabled={refreshing}
              className="w-8 h-8 rounded-lg hover:bg-[#F1F3F5] flex items-center justify-center transition-colors shrink-0"
              title="Check connection"
            >
              <RefreshCw size={14} className={`text-[#868E96] ${refreshing ? "animate-spin" : ""}`} />
            </button>
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
