import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { Terminal } from "lucide-react";

export default function Layout() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 lg:ml-[260px] px-5 sm:px-8 lg:px-12 py-6 pt-16 lg:pt-10 pb-10 overflow-auto">
        <div key={location.pathname} className="max-w-[960px] mx-auto animate-page">
          <Outlet />
        </div>
      </main>

      <button
        onClick={() => setPaletteOpen(true)}
        title="Open command palette (⌘K)"
        className="fixed bottom-5 right-5 z-[150] flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-[#1d1d1f] text-white shadow-lg hover:bg-[#1d1d1f]/90 transition-colors"
      >
        <Terminal size={14} />
        <span className="text-[12px] font-medium hidden sm:inline">Command</span>
        <span className="hidden sm:inline text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded">⌘K</span>
      </button>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
