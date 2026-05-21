import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Radio,
  Package,
  Map,
  Truck,
  Menu,
  X,
  ChevronRight,
  Building2,
  Shield,
  Smartphone,
  Bell,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAlerts } from "../services/api";

const navSections = [
  {
    label: "Overview",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/live-ops", icon: Activity, label: "Live Operations" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/dispatch", icon: Radio, label: "Dispatch Center" },
      { to: "/jobs", icon: Package, label: "Jobs" },
      { to: "/map", icon: Map, label: "Live Map" },
    ],
  },
  {
    label: "Safety & Fleet",
    items: [
      { to: "/safety", icon: Shield, label: "Safety Center" },
      { to: "/drivers", icon: Truck, label: "Drivers" },
      { to: "/devices", icon: Smartphone, label: "Devices" },
    ],
  },
  {
    label: "Inbox",
    items: [
      { to: "/alerts", icon: Bell, label: "Alerts", badgeKey: "alerts" },
    ],
  },
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
    if (location.pathname === "/alerts") {
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
        <div className="px-5 pt-6 pb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Aiviate" className="w-9 h-9" />
            <div>
              <h1 className="text-[15px] font-bold text-[#1d1d1f] tracking-tight leading-tight">Aiviate</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <Building2 size={10} className="text-[#c7c7cc]" />
                <p className="text-[11px] text-[#86868b] font-medium truncate max-w-[140px]">
                  {user?.company_name || "Dispatch"}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.04] transition-colors lg:hidden"
          >
            <X size={16} className="text-[#86868b]" />
          </button>
        </div>

        <div className="px-5 mb-3">
          <div className="h-px bg-black/[0.06]" />
        </div>

        <nav className="flex-1 px-3 overflow-y-auto">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-5" : "mt-1"}>
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#c7c7cc]">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, icon: Icon, label, badgeKey }) => {
                  const badge = badgeKey ? badges[badgeKey] : 0;
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200 ${
                          isActive
                            ? "bg-[#e8e8ed] text-[#3a3a3c]"
                            : "text-[#86868b] hover:text-[#3a3a3c] hover:bg-black/[0.03]"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                              isActive ? "bg-black/[0.05]" : "bg-black/[0.03] group-hover:bg-black/[0.05]"
                            }`}
                          >
                            <Icon size={15} strokeWidth={1.8} />
                          </div>
                          <span className="flex-1">{label}</span>
                          {badge > 0 ? (
                            <span className="text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#ff3b30] text-white">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          ) : (
                            <ChevronRight
                              size={13}
                              className={`transition-all ${
                                isActive
                                  ? "opacity-30"
                                  : "opacity-0 -translate-x-1 group-hover:opacity-30 group-hover:translate-x-0"
                              }`}
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {user && (
          <div className="px-3 pb-5 pt-2">
            <div className="h-px bg-black/[0.06] mb-4 mx-2" />
            <NavLink
              to="/profile"
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/[0.03] transition-colors group"
            >
              <UserAvatar size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#1d1d1f] truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-[#aeaeb2] truncate leading-tight mt-0.5">{user.email}</p>
              </div>
              <ChevronRight size={13} className="text-[#d1d1d6] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </NavLink>
          </div>
        )}
      </aside>
    </>
  );
}
