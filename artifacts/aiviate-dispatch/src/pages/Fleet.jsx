import { useSearchParams } from "react-router-dom";
import { Users, Smartphone, Map } from "lucide-react";
import Drivers from "./Drivers";
import Devices from "./Devices";
import DriverMap from "./DriverMap";

const TABS = [
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "devices", label: "Devices", icon: Smartphone },
  { id: "map", label: "Driver Map", icon: Map },
];

export default function Fleet() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab") === "safety" ? "map" : params.get("tab");
  const active = TABS.some((t) => t.id === requestedTab) ? requestedTab : "drivers";

  const setActive = (id) => setParams(id === "drivers" ? {} : { tab: id }, { replace: true });

  return (
    <div className="animate-fade-in">
      <div className={active === "map" ? "mb-3" : "mb-6 sm:mb-8"}>
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Fleet</h1>
        <p className={`text-[13px] sm:text-[14px] text-[#868E96] mt-1 ${active === "map" ? "hidden" : ""}`}>
          Your drivers, their Guardian devices, and their next delivery destinations.
        </p>
      </div>

      <div className={`inline-flex items-center gap-1 p-1 rounded-xl bg-[#F1F3F5] ${active === "map" ? "mb-3" : "mb-6 sm:mb-8"}`}>
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
      {active === "map" && <DriverMap />}
    </div>
  );
}
