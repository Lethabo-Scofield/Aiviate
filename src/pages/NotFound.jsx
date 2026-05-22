import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in px-4">
      <p className="text-[72px] font-bold text-[#f0f0f0] leading-none mb-3 tracking-tight">404</p>
      <p className="text-[18px] font-semibold text-[#1d1d1f] mb-1">Page not found</p>
      <p className="text-[14px] text-[#86868b] mb-8">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="apple-btn apple-btn-primary"
      >
        <Home size={16} />
        Back to Command
      </Link>
    </div>
  );
}
