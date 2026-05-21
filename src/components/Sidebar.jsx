import { NavLink } from "react-router-dom";
import {
  Eye,
  Radio,
  Package,
  Map,
  Truck,
  Menu,
  X,
  Shield,
  Camera,
  Bell,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAlerts } from "../services/api";

const primaryNav = [
  { to: "/", icon: Shield, label: "Safety" },
  { to: "/live", icon: Activity, label: "Live" },
  { to: "/guardians", icon: Camera, label: "Guardians" },
  { to: "/drivers", icon: Truck, label: "Drivers" },
  { to: "/events", icon: Bell, label: "Events", badgeKey: "alerts" },
];

const secondaryNav = [
  { to: "/dispatch", icon: Radio, label: "Dispatch" },
  { to: "/jobs", icon: Package, label: "Jobs" },
  { to: "/map", icon: Map, label: "Map" },
];

function UserAvatar({ size = 32 }) {
  return (
    <img
      src="/default-avatar.png"
      alt="Profile"
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const data = await getAlerts({ unread: true, limit: 1 });
        if (!cancelled) setUnreadAlerts(data.unread_count || 0);
      } catch {
        /* ignore */
      }
    };
    fetchCount();
    const id = setInterval(fetchCount, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (location.pathname === "/events" || location.pathname === "/alerts") {
      getAlerts({ unread: true, limit: 1 })
        .then((d) => setUnreadAlerts(d.unread_count || 0))
        .catch(() => {});
    }
  }, [location.pathname]);

  const badges = { alerts: unreadAlerts };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-lg border border-black/[0.06] flex items-center justify-center lg:hidden shadow-sm active:scale-95 transition-transform"
      >
        <Menu size={18} className="text-[#1d1d1f]" strokeWidth={1.8} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
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
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.04] transition-colors lg:hidden"
          >
            <X size={16} className="text-[#86868b]" />
          </button>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto space-y-0.5">
          {primaryNav.map(({ to, icon: Icon, label, badgeKey }) => {
            const badge = badgeKey ? badges[badgeKey] : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                    isActive
                      ? "bg-[#f0f0f0] text-[#1d1d1f] font-medium"
                      : "text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03]"
                  }`
                }
              >
                <Icon size={16} strokeWidth={1.8} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#ff3b30] text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </NavLink>
            );
          })}

          <p className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-[0.08em] text-[#c7c7cc] font-semibold">Operations</p>
          {secondaryNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#f0f0f0] text-[#1d1d1f] font-medium"
                    : "text-[#aeaeb2] hover:text-[#1d1d1f] hover:bg-black/[0.03]"
                }`
              }
            >
              <Icon size={15} strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
        </nav>

        {user && (
          <NavLink
            to="/profile"
            className="mx-3 mb-5 mt-2 flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/[0.03] transition-colors"
          >
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
