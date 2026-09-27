import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./Sidebar";
import { ArrowUpRight, X } from "lucide-react";
import { setPendingAsk } from "../lib/askBus";
import { useSpeechToText } from "../lib/useSpeechToText";
import { DictationButtons, DictationNotice } from "./DictationControls";
import { useAuth } from "../contexts/AuthContext";
import Integrations from "../pages/Integrations";
import Settings from "../pages/Settings";
import Silk from "./Silk";

function ProfilePanelModal({ panel, onClose }) {
  const title = panel === "integrations" ? "Integrations" : "Settings";
  return (
    <AnimatePresence>
      {panel && (
        <motion.div
          className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-16 backdrop-blur-md sm:py-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="w-full max-w-[980px] overflow-hidden rounded-[26px] border border-white/70 bg-[#F8F9FA] shadow-[0_30px_90px_rgba(17,19,21,0.24)]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.06] bg-white/85 px-5 py-3 backdrop-blur-md">
              <p className="text-[14px] font-semibold text-[#111315]">{title}</p>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3F5] text-[#5C636A] transition-colors hover:bg-[#E9ECEF] hover:text-[#111315]"
                aria-label={`Close ${title}`}
              >
                <X size={15} strokeWidth={1.6} />
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto p-5 sm:p-7">
              {panel === "integrations" ? <Integrations /> : <Settings />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHome = location.pathname === "/";
  const [topText, setTopText] = useState("");
  const topDictation = useSpeechToText({ value: topText, onChange: setTopText });
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [profilePanel, setProfilePanel] = useState(null);
  const [themeMode, setThemeMode] = useState(() => {
    try { return localStorage.getItem("aiviate_theme_mode") || "dark"; }
    catch { return "dark"; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("aiviate_sidebar_collapsed") === "true"; }
    catch { return false; }
  });
  const topInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-ui", themeMode === "dark");
    try { localStorage.setItem("aiviate_theme_mode", themeMode); }
    catch {
      // Ignore private-mode storage failures.
    }
  }, [themeMode]);

  /**
   * Single entry point for "ask Aiviate" from anywhere in the app.
   * Always takes the user Home, where the page transforms into a
   * chat surface and renders the answer inline. No modal pop-up.
   */
  const goAsk = (text) => {
    const t = (text || "").trim();
    if (location.pathname !== "/") {
      // Queue the ask in a module-scoped buffer; Operations will drain
      // it the moment it mounts. This is reliable regardless of how
      // long the route transition takes.
      setPendingAsk(t);
      navigate("/");
    } else {
      // Already on Home — Operations is mounted, just fire the event.
      window.dispatchEvent(
        new CustomEvent("home:ask", { detail: { text: t } })
      );
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        goAsk("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setProfilePanel(null);
    };
    const onOpenPanel = (e) => {
      if (e?.detail?.panel === "integrations" || e?.detail?.panel === "settings") {
        setProfilePanel(e.detail.panel);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("aiviate:open-panel", onOpenPanel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("aiviate:open-panel", onOpenPanel);
    };
  }, []);

  // Legacy: components that still dispatch the old "ask-aiviate" event
  // are routed through the new chat surface.
  useEffect(() => {
    const onAsk = (e) => goAsk(e?.detail?.text || "");
    window.addEventListener("ask-aiviate", onAsk);
    return () => window.removeEventListener("ask-aiviate", onAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const submitTop = (e) => {
    e?.preventDefault?.();
    const q = topText.trim();
    setTopText("");
    goAsk(q);
  };

  const setSidebar = (collapsed) => {
    setSidebarCollapsed(collapsed);
    try { localStorage.setItem("aiviate_sidebar_collapsed", String(collapsed)); }
    catch {
      // Ignore private-mode storage failures.
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f8f9fa]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebar(true)}
        onExpand={() => setSidebar(false)}
        user={user}
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((mode) => (mode === "dark" ? "light" : "dark"))}
        onOpenIntegrations={() => setProfilePanel("integrations")}
        onOpenSettings={() => setProfilePanel("settings")}
        onOpenProfile={() => navigate("/profile")}
      />
      <main className={`flex-1 overflow-auto transition-[margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
        sidebarCollapsed ? "lg:ml-0" : "lg:ml-[260px]"
      }`}>
        <ProfilePanelModal panel={profilePanel} onClose={() => setProfilePanel(null)} />
        {/* Persistent "Ask Aiviate" bar — shown on every page EXCEPT Home,
            because Home has its own centered hero prompt. */}
        {!isHome && (
          <div className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-black/[0.06]">
            <div className="max-w-[960px] mx-auto px-5 sm:px-8 lg:px-12 max-lg:pl-16 py-3">
              <form onSubmit={submitTop}>
                <motion.div
                  layoutId="ask-aiviate-prompt"
                  transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl bg-[#F1F3F5] border border-black/[0.04] focus-within:border-[#111315]/40 focus-within:bg-white transition-colors"
                >
                  <img src="/logo.png" alt="" className="w-4 h-4 shrink-0" />
                  <input
                    ref={topInputRef}
                    value={topText}
                    onChange={(e) => setTopText(e.target.value)}
                    placeholder={isNarrow ? "Ask Aiviate..." : "Ask Aiviate anything, like \u201cshow me today\u2019s routes\u201d"}
                    aria-label="Ask Aiviate"
                    className="min-w-0 flex-1 bg-transparent outline-none text-[13px] text-[#111315] placeholder:text-[#868E96]"
                  />
                  <DictationButtons dictation={topDictation} size="sm" />
                  {topText.trim() ? (
                    <motion.button
                      type="submit"
                      aria-label="Ask"
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                      className="w-7 h-7 rounded-lg bg-[#111315] hover:bg-[#343A40] text-white flex items-center justify-center shrink-0"
                    >
                      <ArrowUpRight size={13} strokeWidth={1.6} />
                    </motion.button>
                  ) : (
                    <span className="hidden sm:inline text-[10px] font-mono text-[#ADB5BD] border border-black/[0.08] rounded px-1.5 py-0.5 shrink-0">⌘K</span>
                  )}
                </motion.div>
                <DictationNotice dictation={topDictation} className="mt-2 px-1" />
              </form>
            </div>
          </div>
        )}

        {/*
          This is the box that holds <Outlet />, i.e. every page.
          silk-host clips and positions the bands; Silk draws them;
          silk-content lifts the real page content above them so
          nothing gets buried underneath.
        */}
        <div className={`px-5 sm:px-8 lg:px-12 ${isHome ? "pt-8" : "py-6"} pb-10 silk-host`}>
          <Silk variant="a" weight="panel" />
          <div className="silk-content">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
                className="max-w-[960px] mx-auto"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Mobile floating Ask button — takes you straight to the Home chat. */}
      <motion.button
        onClick={() => goAsk("")}
        title="Ask Aiviate"
        aria-label="Ask Aiviate"
        whileTap={{ scale: 0.88 }}
        transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
        className="fixed bottom-5 right-5 z-[150] lg:hidden w-12 h-12 flex items-center justify-center rounded-full bg-[#111315] shadow-lg"
      >
        <img src="/logo.png" alt="Ask Aiviate" className="w-6 h-6 brightness-0 invert" />
      </motion.button>
    </div>
  );
}
