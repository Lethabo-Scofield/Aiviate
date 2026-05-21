import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 lg:ml-[260px] px-5 sm:px-8 lg:px-12 py-6 pt-16 lg:pt-10 pb-10 overflow-auto">
        <div key={location.pathname} className="max-w-[960px] mx-auto animate-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
