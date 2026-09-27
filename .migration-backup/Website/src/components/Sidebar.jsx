import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes, Cable, Clock3, Menu, Moon, PanelLeftClose, PenLine, Settings2, Sun, UserCircle, X,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { queueChatOpen, readChatHistory } from "../lib/chatHistory";

const NAV = [
  { to: "/", icon: PenLine, label: "New Chat", end: true },
  { to: "/orders", icon: Boxes, label: "Orders" },
  { to: "/drivers", icon: UserCircle, label: "Drivers" },
];

function isPathActive(pathname, to, end) {
  if (end || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

function NavItem({ to, icon: Icon, label, end, active, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={`group relative flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[13px] leading-[1.35] outline-none transition-colors duration-150 active:scale-[0.985] ${
        active ? "text-[#111315] font-medium" : "text-[#5C636A] hover:text-[#111315] hover:bg-black/[0.03]"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-xl bg-[#F1F3F5]"
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        />
      )}
      {active && (
        <motion.span
          layoutId="sidebar-active-bar"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-[#111315]"
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        />
      )}
      <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-[9px] border transition-colors duration-150 ${
        active
          ? "border-black/[0.08] bg-white text-[#111315] shadow-[0_1px_1px_rgba(17,19,21,0.04)]"
          : "border-transparent bg-transparent text-[#868E96] group-hover:bg-white group-hover:text-[#111315]"
      }`}>
        <Icon size={16} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round" />
      </span>
      <span className="relative z-10 flex-1">{label}</span>
    </NavLink>
  );
}

function UserAvatar({ user, size = 34 }) {
  return (
    <img
      src="/default-avatar.png"
      alt={user?.name || "Profile"}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export default function Sidebar({
  collapsed = false,
  onCollapse = () => {},
  onExpand = () => {},
  user = null,
  themeMode = "light",
  onToggleTheme = () => {},
  onOpenIntegrations = () => {},
  onOpenSettings = () => {},
  onOpenProfile = () => {},
}) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [history, setHistory] = useState(() => readChatHistory());
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (!profileRef.current?.contains(e.target)) setProfileOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const syncHistory = () => setHistory(readChatHistory());
    window.addEventListener("storage", syncHistory);
    window.addEventListener("aiviate:chat-history-updated", syncHistory);
    return () => {
      window.removeEventListener("storage", syncHistory);
      window.removeEventListener("aiviate:chat-history-updated", syncHistory);
    };
  }, []);

  const openConversation = (id) => {
    queueChatOpen(id);
    window.dispatchEvent(new CustomEvent("aiviate:open-chat", { detail: { id } }));
    navigate("/");
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => { onExpand(); setOpen(true); }}
        aria-label="Open menu"
        className={`fixed left-4 top-4 z-50 h-10 w-10 items-center justify-center rounded-xl border border-black/[0.06] bg-white/90 shadow-sm backdrop-blur-lg transition-transform active:scale-95 ${
          collapsed ? "flex" : "flex lg:hidden"
        }`}
      >
        <Menu size={18} className="text-[#111315]" strokeWidth={1.6} />
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
        className={`w-[260px] fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-white border-r border-black/[0.06] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          collapsed ? "-translate-x-full" : "lg:translate-x-0"
        } ${open && !collapsed ? "translate-x-0" : "-translate-x-full"}
        }`}
      >
        <div className="px-5 pt-7 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Aiviate" className="h-9 w-9 object-contain" />
            <h1 className="text-[15px] font-semibold text-[#111315]">Aiviate</h1>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              if (window.innerWidth >= 1024) onCollapse();
            }}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.04] transition-colors"
          >
            <PanelLeftClose size={16} strokeWidth={1.55} className="hidden text-[#868E96] lg:block" />
            <X size={16} strokeWidth={1.55} className="text-[#868E96] lg:hidden" />
          </button>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto space-y-1">
          {NAV.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              active={isPathActive(location.pathname, item.to, item.end)}
              onClick={item.to === "/" ? () => window.dispatchEvent(new CustomEvent("aiviate:new-chat")) : undefined}
            />
          ))}

          <div className="px-3 pt-6 pb-1 text-[10px] uppercase text-[#ADB5BD] font-semibold">
            History
          </div>
          <div className="space-y-1 px-1 pb-3">
            {history.length ? history.slice(0, 8).map((item) => (
              <button
                key={item.id}
                onClick={() => openConversation(item.id)}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] leading-[1.4] text-[#5C636A] hover:bg-black/[0.03] hover:text-[#111315]"
                title={item.title}
              >
                <Clock3 size={13} strokeWidth={1.6} className="shrink-0 text-[#ADB5BD] group-hover:text-[#5C636A]" />
                <span className="min-w-0 flex-1 truncate">{item.title || "Conversation"}</span>
              </button>
            )) : (
              <p className="px-2 py-2 text-[12px] leading-snug text-[#ADB5BD]">
                Conversations will appear here after you ask Aiviate something.
              </p>
            )}
          </div>
        </nav>

        {user && (
          <div ref={profileRef} className="relative border-t border-black/[0.06] p-3">
            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                  className="absolute bottom-[74px] left-3 right-3 overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_18px_48px_rgba(17,19,21,0.14)]"
                >
                  <div className="border-b border-black/[0.06] px-3 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} size={34} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#111315]">{user.name}</p>
                        <p className="truncate text-[11px] text-[#868E96]">{user.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={() => { setProfileOpen(false); onOpenIntegrations(); }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#343A40] hover:bg-[#F1F3F5] hover:text-[#111315]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#F1F3F5] text-[#111315]">
                        <Cable size={15} strokeWidth={1.55} />
                      </span>
                      Integrations
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); onOpenSettings(); }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#343A40] hover:bg-[#F1F3F5] hover:text-[#111315]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#F1F3F5] text-[#111315]">
                        <Settings2 size={15} strokeWidth={1.55} />
                      </span>
                      Settings
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); onOpenProfile(); }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#343A40] hover:bg-[#F1F3F5] hover:text-[#111315]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#F1F3F5] text-[#111315]">
                        <UserCircle size={15} strokeWidth={1.55} />
                      </span>
                      Profile
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setProfileOpen((value) => !value)}
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
                className="min-w-0 flex flex-1 items-center gap-2 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-black/[0.03]"
              >
                <UserAvatar user={user} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#111315]">{user.name}</p>
                  <p className="truncate text-[11px] text-[#868E96]">{user.role || "member"}</p>
                </div>
              </button>
              <button
                onClick={onToggleTheme}
                aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={themeMode === "dark" ? "Light mode" : "Dark mode"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-black/[0.06] bg-[#F8F9FA] text-[#111315] transition-colors hover:bg-[#F1F3F5]"
              >
                {themeMode === "dark" ? <Sun size={16} strokeWidth={1.6} /> : <Moon size={16} strokeWidth={1.6} />}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
