import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./Sidebar";
import { ArrowRight } from "lucide-react";
import { setPendingAsk } from "../lib/askBus";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  const [topText, setTopText] = useState("");
  const topInputRef = useRef(null);

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

  return (
    <div className="flex min-h-screen bg-[#f8f9fa]">
      <Sidebar />
      <main className="flex-1 lg:ml-[260px] overflow-auto">
        {/* Persistent "Ask Aiviate" bar — shown on every page EXCEPT Home,
            because Home has its own centered hero prompt. */}
        {!isHome && (
          <div className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-black/[0.06]">
            <div className="max-w-[960px] mx-auto px-5 sm:px-8 lg:px-12 py-3 pt-16 lg:pt-3">
              <form onSubmit={submitTop}>
                <motion.div
                  layoutId="ask-aiviate-prompt"
                  transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl bg-[#F1F3F5] border border-black/[0.04] focus-within:border-[#008080]/40 focus-within:bg-white transition-colors"
                >
                  <img src="/logo.png" alt="" className="w-4 h-4 shrink-0" />
                  <input
                    ref={topInputRef}
                    value={topText}
                    onChange={(e) => setTopText(e.target.value)}
                    placeholder='Ask Aiviate anything — try "show me today\u2019s routes"'
                    aria-label="Ask Aiviate"
                    className="flex-1 bg-transparent outline-none text-[13px] text-[#111315] placeholder:text-[#868E96]"
                  />
                  {topText.trim() ? (
                    <motion.button
                      type="submit"
                      aria-label="Ask"
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                      className="w-7 h-7 rounded-lg bg-[#008080] hover:bg-[#006666] text-white flex items-center justify-center shrink-0"
                    >
                      <ArrowRight size={13} />
                    </motion.button>
                  ) : (
                    <span className="text-[10px] font-mono text-[#ADB5BD] border border-black/[0.08] rounded px-1.5 py-0.5 shrink-0">⌘K</span>
                  )}
                </motion.div>
              </form>
            </div>
          </div>
        )}

        <div className={`px-5 sm:px-8 lg:px-12 ${isHome ? "pt-14 lg:pt-8" : "py-6"} pb-10`}>
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
      </main>

      {/* Mobile floating Ask button — takes you straight to the Home chat. */}
      <motion.button
        onClick={() => goAsk("")}
        title="Ask Aiviate"
        aria-label="Ask Aiviate"
        whileTap={{ scale: 0.88 }}
        transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
        className="fixed bottom-5 right-5 z-[150] lg:hidden w-12 h-12 flex items-center justify-center rounded-full bg-[#008080] shadow-lg"
      >
        <img src="/logo.png" alt="Ask Aiviate" className="w-6 h-6 brightness-0 invert" />
      </motion.button>
    </div>
  );
}
