import { useSearchParams } from "react-router-dom";
import { Users, Smartphone, ShieldCheck } from "lucide-react";
import Drivers from "./Drivers";
import Devices from "./Devices";
import SafetyCenter from "./SafetyCenter";

const TABS = [
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "devices", label: "Devices", icon: Smartphone },
  { id: "safety", label: "Safety", icon: ShieldCheck },
];

export default function Fleet() {
  const [params, setParams] = useSearchParams();
  const active = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "drivers";

  const setActive = (id) => setParams(id === "drivers" ? {} : { tab: id }, { replace: true });

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Fleet</h1>
        <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
          Your drivers, their Guardian devices, and live safety — all in one place.
        </p>
      </div>

      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F1F3F5] mb-6 sm:mb-8">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              active === id
                ? "bg-white text-[#111315] shadow-sm"
                : "text-[#868E96] hover:text-[#111315]"
            }`}
          >
            <Icon size={14} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      {active === "drivers" && <Drivers embedded />}
      {active === "devices" && <Devices embedded />}
      {active === "safety" && <SafetyCenter embedded />}
    </div>
  );
}
