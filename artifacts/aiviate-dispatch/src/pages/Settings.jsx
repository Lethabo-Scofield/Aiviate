import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bot,
  Building2,
  ChevronRight,
  Database,
  Headphones,
  KeyRound,
  LogOut,
  Mail,
  Plug,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  addWorkspaceMember,
  getAutopilotStatus,
  getWorkspaceMembers,
  updateAutopilotSettings,
} from "../services/api";

const MODES = [
  { value: "manual", label: "Manual", desc: "Aiviate only suggests - you do everything" },
  { value: "assist", label: "Assist", desc: "Prepares actions but waits for your approval" },
  { value: "autonomous", label: "Autonomous", desc: "Handles routine dispatch on its own" },
  { value: "emergency", label: "Emergency", desc: "Acts immediately, including risky changes" },
];

const AUTOMATION_TOGGLES = [
  { key: "auto_assign", label: "Dispatch agent", desc: "Assign waiting jobs to available drivers" },
  { key: "auto_optimize", label: "Route planning agent", desc: "Re-order stops when a better route is found" },
  { key: "auto_notify", label: "Notification agent", desc: "Alert drivers when their route changes" },
  { key: "safety_approval_required", label: "Safety approval gate", desc: "Safety-related actions always wait for a manager" },
];

const DEFAULT_PREFS = {
  assistant_name: "Aiviate",
  business_context: "Last-mile delivery operations",
  answer_style: "brief",
  voice_mode: true,
  speak_replies: true,
  activity_digest: true,
  exception_alerts: true,
  allow_execution_from_chat: true,
  show_advanced_controls: false,
};

const MEMBER_DEFAULTS = {
  name: "",
  email: "",
  role: "operator",
  password: "",
};

export default function Settings() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const admin = isAdmin ?? user?.role === "admin";

  const [activeTab, setActiveTab] = useState("agent");
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberForm, setMemberForm] = useState(MEMBER_DEFAULTS);
  const [addingMember, setAddingMember] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("aiviate_agent_preferences") || "{}") };
    } catch {
      return DEFAULT_PREFS;
    }
  });

  const tabs = useMemo(() => [
    { key: "agent", label: "Agent", icon: Bot },
    { key: "autonomy", label: "Autonomy", icon: SlidersHorizontal, adminOnly: true },
    { key: "members", label: "Members", icon: Users, adminOnly: true },
    { key: "access", label: "Access", icon: KeyRound },
    { key: "connections", label: "Connections", icon: Plug, adminOnly: true },
  ].filter((tab) => !tab.adminOnly || admin), [admin]);

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

  useEffect(() => {
    if (activeTab !== "members" || !admin) return;
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, admin]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const patch = async (payload) => {
    setBusy(true);
    setError("");
    const previous = settings;
    setSettings((s) => ({ ...(s || {}), ...payload }));
    try {
      const res = await updateAutopilotSettings(payload);
      if (res?.settings) setSettings(res.settings);
      flashSaved();
    } catch (e) {
      setSettings(previous);
      setError(e?.message || "Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  };

  const patchPrefs = (payload) => {
    const next = { ...prefs, ...payload };
    setPrefs(next);
    try { localStorage.setItem("aiviate_agent_preferences", JSON.stringify(next)); }
    catch {
      // Ignore private-mode storage failures.
    }
    window.dispatchEvent(new CustomEvent("aiviate:agent-preferences", { detail: next }));
    flashSaved();
  };

  const loadMembers = async () => {
    setMembersLoading(true);
    setMemberError("");
    try {
      const res = await getWorkspaceMembers();
      setMembers(res.members || []);
    } catch (e) {
      setMemberError(e?.message || "Couldn't load workspace members.");
    } finally {
      setMembersLoading(false);
    }
  };

  const createMember = async (e) => {
    e.preventDefault();
    setAddingMember(true);
    setMemberError("");
    try {
      const res = await addWorkspaceMember(memberForm);
      setMembers((items) => [...items, res.member].filter(Boolean));
      setMemberForm(MEMBER_DEFAULTS);
      flashSaved();
    } catch (err) {
      setMemberError(err?.message || "Couldn't add workspace member.");
    } finally {
      setAddingMember(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="animate-fade-in max-w-5xl pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Settings</h1>
          <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1 max-w-2xl">
            Configure Aiviate, workspace access, members, data connections, and the controls behind your operation.
          </p>
        </div>
        <span className={`text-[12px] text-[#111315] transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"}`}>
          Saved
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E9ECEF] bg-white p-1.5">
        <div className="grid grid-cols-2 gap-1 sm:flex">
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors sm:justify-start ${
                  active ? "bg-[#111315] text-white" : "text-[#5C636A] hover:bg-[#F8F9FA] hover:text-[#111315]"
                }`}
              >
                <Icon size={15} strokeWidth={1.7} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {activeTab === "agent" && (
          <AgentTab prefs={prefs} patchPrefs={patchPrefs} user={user} handleLogout={handleLogout} />
        )}
        {activeTab === "autonomy" && admin && (
          <AutonomyTab settings={settings} busy={busy} patch={patch} error={error} />
        )}
        {activeTab === "members" && admin && (
          <MembersTab
            members={members}
            loading={membersLoading}
            error={memberError}
            form={memberForm}
            setForm={setMemberForm}
            adding={addingMember}
            onSubmit={createMember}
          />
        )}
        {activeTab === "access" && (
          <AccessTab prefs={prefs} patchPrefs={patchPrefs} admin={admin} user={user} />
        )}
        {activeTab === "connections" && admin && <ConnectionsTab />}
      </div>
    </div>
  );
}

function AgentTab({ prefs, patchPrefs, user, handleLogout }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.8fr]">
      <div>
        <SectionTitle icon={Bot}>Aiviate agent</SectionTitle>
        <div className="apple-card p-5 mb-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="block text-[12px] font-medium text-[#5C636A] mb-1.5">Assistant name</span>
              <input
                value={prefs.assistant_name}
                onChange={(e) => patchPrefs({ assistant_name: e.target.value })}
                className="apple-input"
                placeholder="Aiviate"
              />
            </label>
            <label>
              <span className="block text-[12px] font-medium text-[#5C636A] mb-1.5">Business context</span>
              <input
                value={prefs.business_context}
                onChange={(e) => patchPrefs({ business_context: e.target.value })}
                className="apple-input"
                placeholder="Last-mile delivery"
              />
            </label>
          </div>
          <div className="mt-4">
            <p className="text-[12px] font-medium text-[#5C636A] mb-2">Answer style</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["brief", "Brief"],
                ["operator", "Operator"],
                ["detailed", "Detailed"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => patchPrefs({ answer_style: value })}
                  className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors ${
                    prefs.answer_style === value ? "border-[#111315] bg-[#111315] text-white" : "border-[#E9ECEF] bg-white text-[#343A40] hover:bg-[#F8F9FA]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionTitle icon={Headphones}>Voice & notifications</SectionTitle>
        <div className="apple-card divide-y divide-black/[0.06]">
          <SettingToggle
            title="Voice mode"
            desc="Allow browser microphone mode for talking with Aiviate."
            checked={prefs.voice_mode}
            onChange={(v) => patchPrefs({ voice_mode: v })}
          />
          <SettingToggle
            title="Read replies aloud"
            desc="Aiviate may speak responses when voice mode is used."
            checked={prefs.speak_replies}
            onChange={(v) => patchPrefs({ speak_replies: v })}
          />
          <SettingToggle
            title="Exception alerts"
            desc="Surface urgent operational issues immediately."
            checked={prefs.exception_alerts}
            onChange={(v) => patchPrefs({ exception_alerts: v })}
          />
          <SettingToggle
            title="Daily activity digest"
            desc="Summarize routine activity instead of interrupting you."
            checked={prefs.activity_digest}
            onChange={(v) => patchPrefs({ activity_digest: v })}
          />
        </div>
      </div>

      <div>
        <SectionTitle icon={User}>Account</SectionTitle>
        <div className="apple-card p-5">
          <div className="flex items-center gap-4">
            <img src="/default-avatar.png" alt="Profile" className="w-12 h-12 rounded-full object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[#111315] truncate">{user?.name || "-"}</p>
              <p className="text-[12px] text-[#868E96] truncate">{user?.email || "-"}</p>
            </div>
            <button onClick={handleLogout} className="apple-btn apple-btn-secondary text-[#868E96] !px-3.5">
              <LogOut size={14} />
              Sign out
            </button>
          </div>
          <div className="mt-5 pt-1 border-t border-[#F1F3F5]">
            <InfoRow icon={Building2} label="Company" value={user?.company_name} />
            <InfoRow icon={Shield} label="Role" value={user?.role === "admin" ? "Admin" : user?.role} />
            <InfoRow icon={Mail} label="Email" value={user?.email} last />
          </div>
        </div>
      </div>
    </div>
  );
}

function AutonomyTab({ settings, busy, patch, error }) {
  return (
    <div className="max-w-3xl">
      <SectionTitle icon={SlidersHorizontal}>Autonomy</SectionTitle>
      <div className="apple-card mb-3">
        <SettingToggle
          title="Aiviate can run operations"
          desc="Checks the operation and handles allowed routine work."
          checked={!!settings?.enabled}
          disabled={busy || !settings}
          onChange={(v) => patch({ enabled: v })}
        />
      </div>

      <div className={`transition-opacity duration-300 ${settings?.enabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
        <div className="apple-card p-5 mb-3">
          <p className="text-[14px] font-medium text-[#111315] mb-3">Operating mode</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map((m) => {
              const active = settings?.mode === m.value;
              return (
                <button
                  key={m.value}
                  disabled={busy || !settings}
                  onClick={() => patch({ mode: m.value })}
                  className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                    active ? "border-[#111315] bg-[#111315]/[0.04]" : "border-[#E9ECEF] hover:border-[#ced4da]"
                  }`}
                >
                  <span className="block text-[13px] font-medium text-[#111315]">{m.label}</span>
                  <span className="block text-[11px] text-[#868E96] mt-0.5 leading-snug">{m.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="apple-card divide-y divide-black/[0.06] mb-3">
          {AUTOMATION_TOGGLES.map(({ key, label, desc }) => (
            <SettingToggle
              key={key}
              title={label}
              desc={desc}
              checked={!!settings?.[key]}
              disabled={busy || !settings}
              onChange={(v) => patch({ [key]: v })}
            />
          ))}
        </div>

        <div className="apple-card flex items-center gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-[#111315]">Actions per check</p>
            <p className="text-[12px] text-[#868E96] mt-0.5">Maximum changes Aiviate may make in one pass</p>
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
                    active ? "bg-[#111315] text-white" : "bg-[#F1F3F5] text-[#495057] hover:bg-[#E9ECEF]"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p className="text-[12px] text-[#343A40] mt-3">{error}</p>}
    </div>
  );
}

function MembersTab({ members, loading, error, form, setForm, adding, onSubmit }) {
  const update = (payload) => setForm((current) => ({ ...current, ...payload }));
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.84fr]">
      <div>
        <SectionTitle icon={Users}>Workspace members</SectionTitle>
        <div className="apple-card overflow-hidden">
          {loading ? (
            <p className="p-5 text-[13px] text-[#868E96]">Loading members...</p>
          ) : members.length ? (
            <div className="divide-y divide-black/[0.06]">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[13px] font-semibold text-[#111315]">
                    {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#111315]">{member.name}</p>
                    <p className="truncate text-[12px] text-[#868E96]">{member.email}</p>
                  </div>
                  <span className="rounded-full bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium capitalize text-[#5C636A]">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-[13px] text-[#868E96]">No workspace members found yet.</p>
          )}
        </div>
      </div>

      <div>
        <SectionTitle icon={UserPlus}>Add member</SectionTitle>
        <form onSubmit={onSubmit} className="apple-card p-5">
          <div className="space-y-4">
            <label>
              <span className="block text-[12px] font-medium text-[#5C636A] mb-1.5">Full name</span>
              <input
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                className="apple-input"
                placeholder="Jane Operator"
                required
              />
            </label>
            <label>
              <span className="block text-[12px] font-medium text-[#5C636A] mb-1.5">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                className="apple-input"
                placeholder="jane@company.com"
                required
              />
            </label>
            <label>
              <span className="block text-[12px] font-medium text-[#5C636A] mb-1.5">Role</span>
              <select
                value={form.role}
                onChange={(e) => update({ role: e.target.value })}
                className="apple-input"
              >
                <option value="operator">Operator</option>
                <option value="support">Support</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>
              <span className="block text-[12px] font-medium text-[#5C636A] mb-1.5">Temporary password</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update({ password: e.target.value })}
                className="apple-input"
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </label>
          </div>

          {error && <p className="mt-4 rounded-xl bg-[#F8F9FA] px-3 py-2 text-[12px] text-[#343A40]">{error}</p>}

          <button
            type="submit"
            disabled={adding}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#111315] px-4 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#343A40] disabled:bg-[#DEE2E6]"
          >
            <UserPlus size={15} strokeWidth={1.7} />
            {adding ? "Adding..." : "Add member"}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-[#868E96]">
            Drivers are still created from the Drivers tab. This area is for admin, operator and support access to the workspace.
          </p>
        </form>
      </div>
    </div>
  );
}

function AccessTab({ prefs, patchPrefs, admin, user }) {
  return (
    <div className="max-w-3xl">
      <SectionTitle icon={KeyRound}>Access & permissions</SectionTitle>
      <div className="apple-card divide-y divide-black/[0.06] mb-5">
        <SettingToggle
          title="Execute from chat"
          desc="Allow approved actions to be triggered from New Chat."
          checked={prefs.allow_execution_from_chat}
          disabled={!admin}
          onChange={(v) => patchPrefs({ allow_execution_from_chat: v })}
        />
        <SettingToggle
          title="Advanced controls"
          desc="Show more technical controls for operators."
          checked={prefs.show_advanced_controls}
          disabled={!admin}
          onChange={(v) => patchPrefs({ show_advanced_controls: v })}
        />
        <InfoRow icon={Users} label="Admin" value={admin ? "Can configure Aiviate" : "Limited access"} last />
      </div>

      <SectionTitle icon={Shield}>Current session</SectionTitle>
      <div className="apple-card p-5">
        <InfoRow icon={User} label="Name" value={user?.name} />
        <InfoRow icon={Mail} label="Email" value={user?.email} />
        <InfoRow icon={Building2} label="Company" value={user?.company_name} />
        <InfoRow icon={Shield} label="Role" value={user?.role} last />
      </div>
    </div>
  );
}

function ConnectionsTab() {
  return (
    <div className="max-w-3xl">
      <SectionTitle icon={Plug}>Data & connections</SectionTitle>
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
    </div>
  );
}

function SectionTitle({ children, icon: Icon = Sparkles }) {
  return (
    <div className="px-1 pb-2 flex items-center gap-1.5">
      <Icon size={13} strokeWidth={1.7} className="text-[#ADB5BD]" />
      <p className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold">{children}</p>
    </div>
  );
}

function SettingToggle({ title, desc, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[#111315]">{title}</p>
        <p className="text-[12px] text-[#868E96] mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, last }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${!last ? "border-b border-[#F1F3F5]" : ""}`}>
      <Icon size={15} className="text-[#c7c7cc] shrink-0" strokeWidth={1.8} />
      <span className="text-[13px] text-[#868E96] w-20 shrink-0">{label}</span>
      <span className="text-[13px] text-[#111315] font-medium truncate">{value || "-"}</span>
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
        checked ? "bg-[#111315]" : "bg-[#DEE2E6]"
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
