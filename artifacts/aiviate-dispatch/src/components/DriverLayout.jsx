import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, LogOut, MessagesSquare, PlayCircle, Truck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import Walkthrough from "./Walkthrough";
import { DRIVER_TOUR, replayTour, tourStorageKey } from "../lib/tour";

const NAV = [
  { to: "/", label: "My jobs", icon: Truck, end: true },
  { to: "/community", label: "Community", icon: MessagesSquare, tour: "driver-nav-community" },
  { to: "/learn", label: "Learn", icon: BookOpen, tour: "driver-nav-learn" },
];

export default function DriverLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white/90 backdrop-blur-xl border-b border-black/[0.04] sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Aiviate" className="w-7 h-7" />
            <span className="text-[15px] font-semibold text-[#111315] tracking-tight">Aiviate</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={replayTour}
              aria-label="Take the tour"
              title="Take the tour"
              data-tour="driver-tour-btn"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F1F3F5] transition-colors"
            >
              <PlayCircle size={16} className="text-[#868E96]" />
            </button>
            <img src="/default-avatar.png" alt="Profile" className="w-8 h-8 rounded-full object-cover" />
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F1F3F5] transition-colors"
            >
              <LogOut size={15} className="text-[#c7c7cc]" />
            </button>
          </div>
        </div>
        <nav aria-label="Driver navigation" className="max-w-lg mx-auto px-4 flex gap-1 pb-2">
          {NAV.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={({ isActive }) => `flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition-colors ${
                isActive ? "bg-[#111315] text-white" : "text-[#5C636A] hover:bg-[#F1F3F5]"
              }`}
            >
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="px-4 py-6">
        <Outlet />
      </main>
      <Walkthrough steps={DRIVER_TOUR} storageKey={tourStorageKey(user)} />
    </div>
  );
}
