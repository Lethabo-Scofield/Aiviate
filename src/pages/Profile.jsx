import { User, Mail, Building2, Shield, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="animate-fade-in max-w-lg">
      <div className="mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Profile</h1>
        <p className="text-[14px] text-[#868E96] mt-1">Your account details</p>
      </div>

      <div className="apple-card p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <img src="/default-avatar.png" alt="Profile" className="w-16 h-16 rounded-full object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-[18px] font-semibold text-[#111315] truncate">{user?.name || "—"}</p>
            <p className="text-[13px] text-[#868E96] truncate">{user?.email || "—"}</p>
          </div>
        </div>

        <div className="space-y-0">
          <ProfileRow icon={User} label="Name" value={user?.name} />
          <ProfileRow icon={Mail} label="Email" value={user?.email} />
          <ProfileRow icon={Building2} label="Company" value={user?.company_name} />
          <ProfileRow icon={Shield} label="Role" value={user?.role === "admin" ? "Admin" : "Driver"} last />
        </div>
      </div>

      <button
        onClick={handleLogout}
        className="apple-btn apple-btn-secondary w-full text-[#868E96]"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  );
}

function ProfileRow({ icon: Icon, label, value, last }) {
  return (
    <div className={`flex items-center gap-3 py-3.5 ${!last ? "border-b border-[#F1F3F5]" : ""}`}>
      <Icon size={16} className="text-[#c7c7cc] shrink-0" strokeWidth={1.8} />
      <span className="text-[13px] text-[#868E96] w-20 shrink-0">{label}</span>
      <span className="text-[13px] text-[#111315] font-medium truncate">{value || "—"}</span>
    </div>
  );
}
