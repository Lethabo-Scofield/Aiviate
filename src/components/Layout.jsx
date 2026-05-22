import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { Sparkles } from "lucide-react";

export default function Layout() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const [queryNonce, setQueryNonce] = useState(0);

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

  // Anywhere in the app, dispatch `window.dispatchEvent(new CustomEvent('ask-aiviate', { detail: { text } }))`
  // to pop the palette open and auto-run that question.
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

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 lg:ml-[260px] overflow-auto">
        {/* Persistent "Ask Aiviate" bar — visible on every page */}
        <div className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-black/[0.06]">
          <div className="max-w-[960px] mx-auto px-5 sm:px-8 lg:px-12 py-3 pt-16 lg:pt-3">
            <button
              onClick={() => { setInitialQuery(""); setPaletteOpen(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#f5f5f7] hover:bg-[#ebebed] border border-black/[0.04] text-left transition-colors group"
            >
              <Sparkles size={15} className="text-[#008080] shrink-0" />
              <span className="flex-1 text-[13px] text-[#86868b] group-hover:text-[#1d1d1f] truncate">
                Ask Aiviate anything — try <span className="italic text-[#1d1d1f]">"show me today's routes"</span>
              </span>
              <span className="text-[10px] font-mono text-[#aeaeb2] border border-black/[0.08] rounded px-1.5 py-0.5 shrink-0">⌘K</span>
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-8 lg:px-12 py-6 pb-10">
          <div key={location.pathname} className="max-w-[960px] mx-auto animate-page">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Compact mobile-friendly floating trigger */}
      <button
        onClick={() => { setInitialQuery(""); setPaletteOpen(true); }}
        title="Ask Aiviate (⌘K)"
        aria-label="Ask Aiviate"
        className="fixed bottom-5 right-5 z-[150] lg:hidden w-12 h-12 flex items-center justify-center rounded-full bg-[#008080] text-white shadow-lg"
      >
        <Sparkles size={18} />
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
