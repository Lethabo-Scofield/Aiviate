import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Map as MapIcon, Settings, Menu, X,
  ClipboardList, Users, ShoppingBag, Plug,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";

const NAV = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/map", icon: MapIcon, label: "Map" },
  { to: "/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/jobs", icon: ClipboardList, label: "Jobs" },
  { to: "/fleet", icon: Users, label: "Fleet" },
];

const SECONDARY = [
  { to: "/integrations", icon: Plug, label: "Integrations" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

function UserAvatar({ size = 28 }) {
  return (
    <img src="/default-avatar.png" alt="Profile" className="rounded-full object-cover flex-shrink-0"
         style={{ width: size, height: size }} />
  );
}

function isPathActive(pathname, to, end) {
  if (end || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

function NavItem({ to, icon: Icon, label, end, active }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] outline-none transition-colors duration-150 active:scale-[0.985] ${
        active ? "text-[#111315] font-medium" : "text-[#5C636A] hover:text-[#111315] hover:bg-black/[0.03]"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-[#F1F3F5]"
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        />
      )}
      {active && (
        <motion.span
          layoutId="sidebar-active-bar"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-[#008080]"
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        />
      )}
      <Icon
        size={16}
        strokeWidth={1.8}
        className={`relative z-10 transition-colors duration-150 ${
          active ? "text-[#008080]" : "text-[#868E96] group-hover:text-[#111315]"
        }`}
      />
      <span className="relative z-10 flex-1">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-lg border border-black/[0.06] flex items-center justify-center lg:hidden shadow-sm active:scale-95 transition-transform"
      >
        <Menu size={18} className="text-[#111315]" strokeWidth={1.8} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={`w-[260px] fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-white border-r border-black/[0.06] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 pt-7 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Aiviate" className="w-7 h-7" />
            <h1 className="text-[15px] font-semibold text-[#111315] tracking-tight">Aiviate</h1>
          </div>
          <button onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.04] transition-colors lg:hidden">
            <X size={16} className="text-[#868E96]" />
          </button>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto space-y-0.5">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item}
                     active={isPathActive(location.pathname, item.to, item.end)} />
          ))}

          <div className="px-3 pt-6 pb-1 text-[10px] uppercase tracking-wider text-[#ADB5BD] font-semibold">
            Tip
          </div>
          <div className="px-3 py-2 text-[11px] text-[#868E96] leading-snug">
            Press <span className="font-mono text-[#111315] bg-[#F1F3F5] px-1 rounded">⌘K</span> anywhere to ask Aiviate a question or run a command.
          </div>
        </nav>

        <div className="px-3 pb-1 pt-2 space-y-0.5 border-t border-black/[0.05] mx-0">
          {SECONDARY.map((item) => (
            <NavItem key={item.to} {...item}
                     active={isPathActive(location.pathname, item.to, item.end)} />
          ))}
        </div>

        {user && (
          <NavLink to="/profile"
            className={`mx-3 mb-4 mt-1 flex items-center gap-3 px-2 py-2 rounded-lg transition-colors duration-150 active:scale-[0.985] ${
              location.pathname === "/profile" ? "bg-[#F1F3F5]" : "hover:bg-black/[0.03]"
            }`}>
            <UserAvatar size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#111315] truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-[#ADB5BD] truncate leading-tight mt-0.5">{user.email}</p>
            </div>
          </NavLink>
        )}
      </aside>
    </>
  );
}
