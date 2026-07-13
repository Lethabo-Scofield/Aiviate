import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, ChevronRight, Database, LogOut, Mail, Plug, Shield, User,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getAutopilotStatus, updateAutopilotSettings } from "../services/api";

const MODES = [
  { value: "manual", label: "Manual", desc: "Aiviate only suggests — you do everything" },
  { value: "assist", label: "Assist", desc: "Prepares actions but waits for your approval" },
  { value: "autonomous", label: "Autonomous", desc: "Handles routine dispatch on its own" },
  { value: "emergency", label: "Emergency", desc: "Acts immediately, including risky changes" },
];

const AUTOMATION_TOGGLES = [
  { key: "auto_assign", label: "Auto-assign jobs", desc: "Match waiting jobs to available drivers" },
  { key: "auto_optimize", label: "Auto-optimize routes", desc: "Re-order stops when a better route is found" },
  { key: "auto_notify", label: "Auto-notify drivers", desc: "Alert drivers when their route changes" },
  { key: "safety_approval_required", label: "Safety approval required", desc: "Safety-related actions always wait for you" },
];

export default function Settings() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const admin = isAdmin ?? user?.role === "admin";

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getAutopilotStatus();
        if (!cancelled) setSettings(res?.settings || null);
      } catch {
        if (!cancelled) setError("Couldn't load Autopilot settings.");
      }
    })();
    return () => { cancelled = true; };
  }, [admin]);

  const patch = async (payload) => {
    setBusy(true);
    setError("");
    const previous = settings;
    setSettings((s) => ({ ...(s || {}), ...payload }));
    try {
      const res = await updateAutopilotSettings(payload);
      if (res?.settings) setSettings(res.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      setSettings(previous);
      setError(e?.message || "Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="animate-fade-in max-w-2xl pb-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Settings</h1>
        <span
          className={`text-[12px] text-[#008080] transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"}`}
        >
          Saved
        </span>
      </div>
      <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1 mb-6 sm:mb-8">
        Your account and how Aiviate runs your operation.
      </p>

      {/* Account */}
      <SectionTitle>Account</SectionTitle>
      <div className="apple-card p-5 mb-8">
        <div className="flex items-center gap-4">
          <img src="/default-avatar.png" alt="Profile" className="w-12 h-12 rounded-full object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#111315] truncate">{user?.name || "—"}</p>
            <p className="text-[12px] text-[#868E96] truncate">{user?.email || "—"}</p>
          </div>
          <button onClick={handleLogout} className="apple-btn apple-btn-secondary text-[#868E96] !px-3.5">
            <LogOut size={14} />
            Sign out
          </button>
        </div>
        <div className="mt-5 pt-1 border-t border-[#F1F3F5]">
          <InfoRow icon={Building2} label="Company" value={user?.company_name} />
          <InfoRow icon={Shield} label="Role" value={user?.role === "admin" ? "Admin" : "Driver"} />
          <InfoRow icon={Mail} label="Email" value={user?.email} last />
        </div>
      </div>

      {/* Autopilot */}
      {admin && (
        <>
          <SectionTitle>Autopilot</SectionTitle>
          <div className="apple-card mb-3">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[#111315]">Autopilot enabled</p>
                <p className="text-[12px] text-[#868E96] mt-0.5">
                  Aiviate checks the operation every 30 seconds and handles routine work.
                </p>
              </div>
              <Toggle
                checked={!!settings?.enabled}
                disabled={busy || !settings}
                onChange={(v) => patch({ enabled: v })}
              />
            </div>
          </div>

          <div className={`transition-opacity duration-300 ${settings?.enabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
            <div className="apple-card p-5 mb-3">
              <p className="text-[14px] font-medium text-[#111315] mb-3">Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => {
                  const active = settings?.mode === m.value;
                  return (
                    <button
                      key={m.value}
                      disabled={busy || !settings}
                      onClick={() => patch({ mode: m.value })}
                      className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                        active
                          ? "border-[#008080] bg-[#008080]/[0.04]"
                          : "border-[#E9ECEF] hover:border-[#ced4da]"
                      }`}
                    >
                      <span className={`block text-[13px] font-medium ${active ? "text-[#008080]" : "text-[#111315]"}`}>
                        {m.label}
                      </span>
                      <span className="block text-[11px] text-[#868E96] mt-0.5 leading-snug">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="apple-card divide-y divide-black/[0.06] mb-3">
              {AUTOMATION_TOGGLES.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#111315]">{label}</p>
                    <p className="text-[12px] text-[#868E96] mt-0.5">{desc}</p>
                  </div>
                  <Toggle
                    checked={!!settings?.[key]}
                    disabled={busy || !settings}
                    onChange={(v) => patch({ [key]: v })}
                  />
                </div>
              ))}
            </div>

            <div className="apple-card flex items-center gap-4 px-5 py-4 mb-8">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[#111315]">Actions per check</p>
                <p className="text-[12px] text-[#868E96] mt-0.5">Maximum changes Autopilot may make in one pass</p>
              </div>
              <div className="flex items-center gap-1">
                {[1, 3, 5, 10].map((n) => {
                  const active = Number(settings?.max_actions_per_run) === n;
                  return (
                    <button
                      key={n}
                      disabled={busy || !settings}
                      onClick={() => patch({ max_actions_per_run: n })}
                      className={`w-9 h-8 rounded-lg text-[13px] font-medium transition-colors ${
                        active ? "bg-[#008080] text-white" : "bg-[#F1F3F5] text-[#495057] hover:bg-[#E9ECEF]"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-[#e03131] mb-6 -mt-1">{error}</p>
          )}
        </>
      )}

      {/* Data & connections */}
      {admin && (
        <>
          <SectionTitle>Data &amp; connections</SectionTitle>
          <div className="apple-card divide-y divide-black/[0.06]">
            <SettingsLink
              to="/settings/data-sources"
              icon={Database}
              label="Delivery data sources"
              desc="API, CSV upload, or a folder of stops"
            />
            <SettingsLink
              to="/integrations"
              icon={Plug}
              label="Integrations"
              desc="Connected stores and services"
            />
          </div>
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="px-1 pb-2 text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold">
      {children}
    </p>
  );
}

function InfoRow({ icon: Icon, label, value, last }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${!last ? "border-b border-[#F1F3F5]" : ""}`}>
      <Icon size={15} className="text-[#c7c7cc] shrink-0" strokeWidth={1.8} />
      <span className="text-[13px] text-[#868E96] w-20 shrink-0">{label}</span>
      <span className="text-[13px] text-[#111315] font-medium truncate">{value || "—"}</span>
    </div>
  );
}

function SettingsLink({ to, icon: Icon, label, desc }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 px-5 py-4 hover:bg-black/[0.02] transition-colors first:rounded-t-2xl last:rounded-b-2xl"
    >
      <div className="w-9 h-9 rounded-xl bg-[#F1F3F5] flex items-center justify-center">
        <Icon size={16} className="text-[#111315]" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[#111315]">{label}</p>
        <p className="text-[12px] text-[#868E96] mt-0.5 truncate">{desc}</p>
      </div>
      <ChevronRight size={16} className="text-[#c7c7cc]" />
    </Link>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-[42px] h-[26px] rounded-full shrink-0 transition-colors duration-200 ${
        checked ? "bg-[#008080]" : "bg-[#DEE2E6]"
      } ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
