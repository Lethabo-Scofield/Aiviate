import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function DriverLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white/90 backdrop-blur-xl border-b border-black/[0.04] sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Aiviate" className="w-7 h-7" />
            <span className="text-[15px] font-semibold text-[#111315] tracking-tight">Aiviate</span>
          </div>
          <div className="flex items-center gap-3">
            <img src="/default-avatar.png" alt="Profile" className="w-8 h-8 rounded-full object-cover" />
            <button
              onClick={logout}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F1F3F5] transition-colors"
            >
              <LogOut size={15} className="text-[#c7c7cc]" />
            </button>
          </div>
        </div>
      </header>
      <main className="px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
