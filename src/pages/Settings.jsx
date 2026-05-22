import { Link } from "react-router-dom";
import { Smartphone, Shield, Map, Package, User, ChevronRight, Database } from "lucide-react";

const sections = [
  { to: "/settings/data-sources", icon: Database, label: "Delivery data sources", desc: "API, CSV upload, or a folder of stops" },
  { to: "/devices", icon: Smartphone, label: "Devices", desc: "Guardian units, pairing, firmware" },
  { to: "/safety", icon: Shield, label: "Safety center", desc: "Fatigue trends and driver risk" },
  { to: "/jobs", icon: Package, label: "Jobs", desc: "Full delivery list and history" },
  { to: "/map", icon: Map, label: "Map", desc: "Geographic view of routes" },
  { to: "/profile", icon: User, label: "Account", desc: "Profile and sign-out" },
];

export default function Settings() {
  return (
    <div className="animate-fade-in max-w-2xl">
      <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Settings</h1>
      <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1 mb-6 sm:mb-8">
        Everything else — the screens you visit occasionally.
      </p>
      <div className="apple-card divide-y divide-black/[0.06]">
        {sections.map(({ to, icon: Icon, label, desc }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 px-5 py-4 hover:bg-black/[0.02] transition-colors first:rounded-t-2xl last:rounded-b-2xl"
          >
            <div className="w-9 h-9 rounded-xl bg-[#f5f5f7] flex items-center justify-center">
              <Icon size={16} className="text-[#1d1d1f]" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-[#1d1d1f]">{label}</p>
              <p className="text-[12px] text-[#86868b] mt-0.5 truncate">{desc}</p>
            </div>
            <ChevronRight size={16} className="text-[#c7c7cc]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
