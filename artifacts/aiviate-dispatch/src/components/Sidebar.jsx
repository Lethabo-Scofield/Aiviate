import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes, Clock3, Menu, PanelLeftClose, PenLine, UserCircle, X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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

function NavItem({ to, icon: Icon, label, end, active, onClick, primary = false, number }) {
  const reduceMotion = useReducedMotion();
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={`group relative flex min-h-11 items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2.5 text-[13px] leading-[1.35] outline-none transition-[background-color,color,transform] duration-200 ease-out hover:translate-x-1 focus-visible:ring-2 focus-visible:ring-[#111315] active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:translate-x-0 ${
        active ? "font-semibold text-[#111315]" : "text-[#5C636A] hover:bg-black/[0.03] hover:text-[#111315]"
      } ${
        primary ? "border border-black/[0.06]" : ""
      }`}
    >
      {active && (
        <motion.span
          layoutId={reduceMotion ? undefined : "sidebar-active-pill"}
          className="absolute inset-0 rounded-xl bg-[#F1F3F5]"
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
        />
      )}
      {active && (
        <motion.span
          layoutId={reduceMotion ? undefined : "sidebar-active-bar"}
          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-[#111315]"
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
        />
      )}
      <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-[9px] border transition-[background-color,color,transform] duration-200 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none ${
        active
          ? "border-black/[0.08] bg-white text-[#111315] shadow-[0_1px_1px_rgba(17,19,21,0.04)]"
          : "border-transparent bg-transparent text-[#868E96] group-hover:bg-white group-hover:text-[#111315]"
      }`}>
        <Icon size={16} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round" />
      </span>
      <span className="relative z-10 min-w-0 flex-1">{label}</span>
      {number && <span aria-hidden="true" className="relative z-10 translate-x-1 text-[10px] font-medium tabular-nums text-[#ADB5BD] opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none">{number}</span>}
    </NavLink>
  );
}

export default function Sidebar({
  collapsed = false,
  onCollapse = () => {},
  onExpand = () => {},
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(() => readChatHistory());
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
        className={`fixed left-4 top-4 z-50 h-10 w-10 items-center justify-center rounded-xl border border-black/[0.06] bg-white/90 shadow-sm backdrop-blur-lg transition-transform hover:-rotate-6 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 ${
          collapsed ? "flex" : "flex lg:hidden"
        }`}
      >
        <Menu size={18} className="text-[#111315]" strokeWidth={1.6} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex w-[260px] flex-col border-r border-black/[0.06] bg-white transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:duration-0 ${
          collapsed ? "-translate-x-full" : "lg:translate-x-0"
        } ${open && !collapsed ? "translate-x-0" : "-translate-x-full"}
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-7 pt-7">
          <div className="group flex items-center gap-2.5">
            <motion.img
              src="/logo.png"
              alt="Aiviate"
              className="h-9 w-9 object-contain"
              whileHover={reduceMotion ? undefined : { rotate: -8, scale: 1.08 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            />
            <div>
              <h1 className="text-[15px] font-semibold leading-tight text-[#111315]">Aiviate</h1>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ADB5BD]">Dispatch</p>
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              if (window.innerWidth >= 1024) onCollapse();
            }}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-full transition-[background-color,transform] hover:-translate-x-0.5 hover:bg-black/[0.04] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
          >
            <PanelLeftClose size={16} strokeWidth={1.55} className="hidden text-[#868E96] lg:block" />
            <X size={16} strokeWidth={1.55} className="text-[#868E96] lg:hidden" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto overscroll-contain px-3">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.2, 0, 0, 1] }}
          >
            <div className="px-1">
              <NavItem
                {...NAV[0]}
                primary
                active={isPathActive(location.pathname, NAV[0].to, NAV[0].end)}
                onClick={() => window.dispatchEvent(new CustomEvent("aiviate:new-chat"))}
              />
            </div>
            <div className="flex items-center gap-2 px-3 pb-2 pt-7">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ADB5BD]">Workspace</span>
              <span aria-hidden="true" className="h-px flex-1 border-t border-black/[0.06]" />
            </div>
            <div className="space-y-1">
              {NAV.slice(1).map((item, index) => (
                <NavItem
                  key={item.to}
                  {...item}
                  number={`0${index + 1}`}
                  active={isPathActive(location.pathname, item.to, item.end)}
                />
              ))}
            </div>
          </motion.div>

          <div className="flex items-center gap-2 px-3 pb-2 pt-7">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ADB5BD]">History</span>
            <span aria-hidden="true" className="h-px flex-1 border-t border-black/[0.06]" />
          </div>
          <div className="ml-4 space-y-1 border-l border-black/[0.06] pb-3 pl-2">
            {history.length ? history.slice(0, 8).map((item, index) => (
              <motion.button
                key={item.id}
                onClick={() => openConversation(item.id)}
                initial={reduceMotion ? false : { opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, delay: reduceMotion ? 0 : index * 0.04 }}
                whileHover={reduceMotion ? undefined : { x: 3 }}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                className="group relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] leading-[1.4] text-[#5C636A] transition-colors hover:bg-black/[0.03] hover:text-[#111315] focus-visible:outline-2 focus-visible:outline-[#111315]"
                title={item.title}
              >
                <span aria-hidden="true" className="absolute -left-[12px] h-1.5 w-1.5 rounded-full border border-[#ADB5BD] bg-white transition-transform duration-200 group-hover:scale-150 motion-reduce:transition-none" />
                <Clock3 size={13} strokeWidth={1.6} className="shrink-0 text-[#ADB5BD] group-hover:text-[#5C636A]" />
                <span className="min-w-0 flex-1 truncate">{item.title || "Conversation"}</span>
              </motion.button>
            )) : (
              <p className="px-2 py-2 text-[12px] leading-snug text-[#ADB5BD]">
                Conversations will appear here after you ask Aiviate something.
              </p>
            )}
          </div>
        </nav>

      </aside>
    </>
  );
}
