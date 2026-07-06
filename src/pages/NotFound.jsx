import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in px-4">
      <p className="text-[72px] font-bold text-[#F1F3F5] leading-none mb-3 tracking-tight">404</p>
      <p className="text-[18px] font-semibold text-[#111315] mb-1">Page not found</p>
      <p className="text-[14px] text-[#868E96] mb-8">The page you're looking for doesn't exist.</p>
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
