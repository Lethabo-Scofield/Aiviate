import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { ArrowRight } from "lucide-react";

/** Fire the global ask-aiviate event so any listener (Layout) can open the palette and run it. */
function ask(text) {
  window.dispatchEvent(new CustomEvent("ask-aiviate", { detail: { text: text || "" } }));
}

export default function Layout() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const [queryNonce, setQueryNonce] = useState(0);
  const [topText, setTopText] = useState("");
  const topInputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setInitialQuery("");
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  // Anywhere in the app: window.dispatchEvent(new CustomEvent('ask-aiviate', {detail:{text}}))
  useEffect(() => {
    const onAsk = (e) => {
      const text = e?.detail?.text || "";
      setInitialQuery(text);
      setQueryNonce((n) => n + 1);
      setPaletteOpen(true);
    };
    window.addEventListener("ask-aiviate", onAsk);
    return () => window.removeEventListener("ask-aiviate", onAsk);
  }, []);

  const submitTop = (e) => {
    e?.preventDefault?.();
    const q = topText.trim();
    if (!q) {
      // Empty submit just opens the palette with focus.
      setInitialQuery("");
      setPaletteOpen(true);
      return;
    }
    setTopText("");
    ask(q);
  };

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 lg:ml-[260px] overflow-auto">
        {/* Persistent "Ask Aiviate" bar — shown on every page EXCEPT Home,
            because Home has its own centered hero prompt. */}
        {!isHome && (
          <div className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-black/[0.06]">
            <div className="max-w-[960px] mx-auto px-5 sm:px-8 lg:px-12 py-3 pt-16 lg:pt-3">
              <form
                onSubmit={submitTop}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-xl bg-[#f5f5f7] border border-black/[0.04] focus-within:border-[#008080]/40 focus-within:bg-white transition-colors"
              >
                <img src="/logo.png" alt="" className="w-4 h-4 shrink-0" />
                <input
                  ref={topInputRef}
                  value={topText}
                  onChange={(e) => setTopText(e.target.value)}
                  placeholder='Ask Aiviate anything — try "show me today\u2019s routes"'
                  aria-label="Ask Aiviate"
                  className="flex-1 bg-transparent outline-none text-[13px] text-[#1d1d1f] placeholder:text-[#86868b]"
                />
                {topText.trim() ? (
                  <button
                    type="submit"
                    aria-label="Ask"
                    className="w-7 h-7 rounded-lg bg-[#008080] hover:bg-[#006666] text-white flex items-center justify-center shrink-0"
                  >
                    <ArrowRight size={13} />
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-[#aeaeb2] border border-black/[0.08] rounded px-1.5 py-0.5 shrink-0">⌘K</span>
                )}
              </form>
            </div>
          </div>
        )}

        <div className={`px-5 sm:px-8 lg:px-12 ${isHome ? "pt-14 lg:pt-8" : "py-6"} pb-10`}>
          <div key={location.pathname} className="max-w-[960px] mx-auto animate-page">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile floating Ask button */}
      <button
        onClick={() => { setInitialQuery(""); setPaletteOpen(true); }}
        title="Ask Aiviate"
        aria-label="Ask Aiviate"
        className="fixed bottom-5 right-5 z-[150] lg:hidden w-12 h-12 flex items-center justify-center rounded-full bg-[#008080] shadow-lg"
      >
        <img src="/logo.png" alt="Ask Aiviate" className="w-6 h-6 brightness-0 invert" />
      </button>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        initialQuery={initialQuery}
        queryNonce={queryNonce}
      />
    </div>
  );
}
