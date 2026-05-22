import { NavLink, useLocation } from "react-router-dom";
import { Home, Map as MapIcon, Settings, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

const NAV = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/map", icon: MapIcon, label: "Map" },
];

function UserAvatar({ size = 28 }) {
  return (
    <img src="/default-avatar.png" alt="Profile" className="rounded-full object-cover flex-shrink-0"
         style={{ width: size, height: size }} />
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-lg border border-black/[0.06] flex items-center justify-center lg:hidden shadow-sm active:scale-95 transition-transform"
      >
        <Menu size={18} className="text-[#1d1d1f]" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
             onClick={() => setOpen(false)} />
      )}

      <aside
        className={`w-[260px] fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-white border-r border-black/[0.06] transition-transform duration-300 ease-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 pt-7 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Aiviate" className="w-7 h-7" />
            <h1 className="text-[15px] font-semibold text-[#1d1d1f] tracking-tight">Aiviate</h1>
          </div>
          <button onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.04] transition-colors lg:hidden">
            <X size={16} className="text-[#86868b]" />
          </button>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto space-y-0.5">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#f0f0f0] text-[#1d1d1f] font-medium"
                    : "text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03]"
                }`
              }>
              <Icon size={16} strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}

          <div className="px-3 pt-6 pb-1 text-[10px] uppercase tracking-wider text-[#aeaeb2] font-semibold">
            Tip
          </div>
          <div className="px-3 py-2 text-[11px] text-[#86868b] leading-snug">
            Press <span className="font-mono text-[#1d1d1f] bg-[#f5f5f7] px-1 rounded">⌘K</span> anywhere to ask Aiviate a question or run a command.
          </div>
        </nav>

        <NavLink to="/settings"
          className={({ isActive }) =>
            `mx-3 mb-1 flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              isActive
                ? "bg-[#f0f0f0] text-[#1d1d1f] font-medium"
                : "text-[#aeaeb2] hover:text-[#1d1d1f] hover:bg-black/[0.03]"
            }`
          }>
          <Settings size={15} strokeWidth={1.8} />
          <span>Settings</span>
        </NavLink>

        {user && (
          <NavLink to="/profile"
            className="mx-3 mb-5 mt-2 flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/[0.03] transition-colors">
            <UserAvatar size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#1d1d1f] truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-[#aeaeb2] truncate leading-tight mt-0.5">{user.email}</p>
            </div>
          </NavLink>
        )}
      </aside>
    </>
  );
}
