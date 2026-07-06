import { useState, useEffect } from "react";
import { Truck, Plus, Trash2, X, Copy, Check, KeyRound, Shield, Car, Bike, Container, Eye, EyeOff, Ban, RefreshCw, ChevronRight, MapPin, Clock, CheckCircle, ArrowLeft, Package } from "lucide-react";
import { Spinner, SkeletonList } from "../components/Loader";
import { getDrivers, addDriver, removeDriver, getJobs, getDriverDetail, toggleBlockDriver, resetDriverPassword, getDriverDeliveries } from "../services/api";

const VEHICLE_ICONS = { van: Container, truck: Truck, car: Car, bike: Bike };

function VehicleIcon({ type, size = 17, className = "text-[#868E96]" }) {
  const Icon = VEHICLE_ICONS[type] || Truck;
  return <Icon size={size} className={className} strokeWidth={1.8} />;
}

function DriverDetailPanel({ driverId, onClose, onUpdate }) {
  const [detail, setDetail] = useState(null);
  const [deliveries, setDeliveries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState("info");

  useEffect(() => {
    loadDetail();
  }, [driverId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const [d, del] = await Promise.all([
        getDriverDetail(driverId),
        getDriverDeliveries(driverId),
      ]);
      setDetail(d.driver);
      setDeliveries(del.deliveries || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    setBlocking(true);
    try {
      const result = await toggleBlockDriver(driverId);
      setDetail(prev => ({ ...prev, blocked: result.blocked }));
      onUpdate();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setBlocking(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm("Generate a new password for this driver? The old password will stop working.")) return;
    setResetting(true);
    try {
      const result = await resetDriverPassword(driverId);
      setDetail(prev => ({ ...prev, last_generated_password: result.new_password }));
      setShowPassword(true);
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setResetting(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <button onClick={onClose} className="flex items-center gap-1.5 text-[13px] text-[#868E96] hover:text-[#111315] mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to drivers
        </button>
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-4 w-32 mb-8" />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="animate-fade-in">
        <button onClick={onClose} className="flex items-center gap-1.5 text-[13px] text-[#868E96] hover:text-[#111315] mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to drivers
        </button>
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#868E96]">Driver not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <button onClick={onClose} className="flex items-center gap-1.5 text-[13px] text-[#868E96] hover:text-[#111315] mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to drivers
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F1F3F5] flex items-center justify-center shrink-0">
            <VehicleIcon type={detail.vehicle_type} size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">{detail.name}</h1>
              {detail.blocked && (
                <span className="px-2 py-0.5 rounded-md bg-[#ff3b30]/10 text-[11px] font-semibold text-[#ff3b30]">BLOCKED</span>
              )}
            </div>
            <p className="text-[14px] text-[#868E96]">{detail.email} &middot; {detail.vehicle_type}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBlock} disabled={blocking} className={`apple-btn ${detail.blocked ? 'apple-btn-primary' : 'apple-btn-secondary'} text-[13px]`}>
            {blocking ? <Spinner size={14} /> : <Ban size={14} />}
            {detail.blocked ? "Unblock" : "Block"}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-[#F1F3F5] rounded-xl p-1">
        {[
          { id: "info", label: "Info & Login" },
          { id: "deliveries", label: "Deliveries" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-[13px] font-medium transition-all ${tab === t.id ? 'bg-white text-[#111315] shadow-sm' : 'text-[#868E96] hover:text-[#111315]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-card p-4 rounded-2xl">
              <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider mb-1">Total Jobs</p>
              <p className="text-[22px] font-semibold text-[#111315]">{detail.total_jobs}</p>
            </div>
            <div className="stat-card p-4 rounded-2xl">
              <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider mb-1">Completed</p>
              <p className="text-[22px] font-semibold text-[#111315]">{detail.completed_jobs}</p>
            </div>
            <div className="stat-card p-4 rounded-2xl">
              <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider mb-1">Active</p>
              <p className="text-[22px] font-semibold text-[#111315]">{detail.active_jobs}</p>
            </div>
            <div className="stat-card p-4 rounded-2xl">
              <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider mb-1">Stops Done</p>
              <p className="text-[22px] font-semibold text-[#111315]">{detail.total_stops_completed}<span className="text-[14px] text-[#868E96] font-normal">/{detail.total_stops_assigned}</span></p>
            </div>
          </div>

          <div className="apple-card p-5">
            <h3 className="text-[15px] font-semibold text-[#111315] mb-4">Login Credentials</h3>
            <div className="space-y-3 bg-[#F1F3F5] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider">Email</p>
                  <p className="text-[14px] text-[#111315] font-mono">{detail.email}</p>
                </div>
                <button onClick={() => copyToClipboard(detail.email, "email")}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/80 transition-colors">
                  {copiedField === "email" ? <Check size={14} className="text-[#34c759]" /> : <Copy size={14} className="text-[#868E96]" />}
                </button>
              </div>
              <div className="h-px bg-black/[0.06]" />
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider">Password</p>
                  {detail.last_generated_password ? (
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] text-[#111315] font-mono">
                        {showPassword ? detail.last_generated_password : "••••••••"}
                      </p>
                      <button onClick={() => setShowPassword(!showPassword)}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/80 transition-colors">
                        {showPassword ? <EyeOff size={12} className="text-[#868E96]" /> : <Eye size={12} className="text-[#868E96]" />}
                      </button>
                    </div>
                  ) : (
                    <p className="text-[13px] text-[#ADB5BD] italic">Not available</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {detail.last_generated_password && (
                    <button onClick={() => copyToClipboard(detail.last_generated_password, "password")}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/80 transition-colors">
                      {copiedField === "password" ? <Check size={14} className="text-[#34c759]" /> : <Copy size={14} className="text-[#868E96]" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={handleResetPassword} disabled={resetting}
              className="apple-btn apple-btn-secondary mt-4 text-[13px]">
              {resetting ? <><Spinner size={14} /> Resetting...</> : <><RefreshCw size={14} /> Reset Password</>}
            </button>
          </div>

          <div className="apple-card p-5">
            <h3 className="text-[15px] font-semibold text-[#111315] mb-3">Details</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between">
                <span className="text-[13px] text-[#868E96]">Driver ID</span>
                <span className="text-[13px] text-[#111315] font-mono">{detail.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[13px] text-[#868E96]">Vehicle</span>
                <span className="text-[13px] text-[#111315] capitalize">{detail.vehicle_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[13px] text-[#868E96]">Status</span>
                <span className={`text-[13px] font-medium ${detail.blocked ? 'text-[#ff3b30]' : 'text-[#34c759]'}`}>
                  {detail.blocked ? "Blocked" : "Active"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[13px] text-[#868E96]">Created</span>
                <span className="text-[13px] text-[#111315]">{detail.created_at ? new Date(detail.created_at).toLocaleDateString() : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "deliveries" && (
        <div className="space-y-3 animate-fade-in">
          {!deliveries || deliveries.length === 0 ? (
            <div className="apple-card p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-3">
                <Package size={20} className="text-[#c7c7cc]" strokeWidth={1.5} />
              </div>
              <p className="text-[14px] text-[#868E96]">No deliveries yet</p>
              <p className="text-[12px] text-[#ADB5BD] mt-1">Assign jobs to this driver to see their delivery history</p>
            </div>
          ) : (
            deliveries.map((d, i) => (
              <div key={d.job.id} className="apple-card p-4 animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${d.job.status === 'completed' ? 'bg-[#34c759]' : d.job.status === 'assigned' ? 'bg-[#007aff]' : 'bg-[#ADB5BD]'}`} />
                    <p className="text-[14px] font-semibold text-[#111315]">{d.job.area || "Job"}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                    d.job.status === 'completed' ? 'bg-[#34c759]/10 text-[#34c759]' :
                    d.job.status === 'assigned' ? 'bg-[#007aff]/10 text-[#007aff]' :
                    'bg-[#F1F3F5] text-[#868E96]'
                  }`}>
                    {d.job.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-[#868E96]">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {d.completed_stops}/{d.total_stops} stops
                  </span>
                  {d.job.total_distance_km > 0 && (
                    <span>{d.job.total_distance_km} km</span>
                  )}
                  {d.job.completed_at && (
                    <span className="flex items-center gap-1">
                      <CheckCircle size={12} /> {new Date(d.job.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {d.total_stops > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-[#F1F3F5] rounded-full overflow-hidden">
                      <div className="h-full bg-[#008080] rounded-full transition-all" style={{ width: `${d.completion_pct}%` }} />
                    </div>
                    <p className="text-[11px] text-[#ADB5BD] mt-1">{d.completion_pct}% complete</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Drivers({ embedded = false }) {
  const [drivers, setDrivers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", vehicle_type: "van", password: "" });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDriverCredentials, setNewDriverCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [error, setError] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState(null);

  const loadData = async () => {
    try {
      const [d, j] = await Promise.all([getDrivers(), getJobs()]);
      setDrivers(d.drivers || []);
      setJobs(j.jobs || []);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Failed to load drivers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setAdding(true);
    try {
      const result = await addDriver(form.name, form.email, form.vehicle_type, form.password);
      const driver = result.driver;
      setNewDriverCredentials({
        name: driver.name,
        email: form.email.toLowerCase(),
        password: driver.generated_password,
      });
      setForm({ name: "", email: "", vehicle_type: "van", password: "" });
      setShowForm(false);
      loadData();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Remove this driver? Their login account will also be deleted.")) return;
    try {
      await removeDriver(id);
      loadData();
    } catch (e) {
      alert("Failed: " + e.message);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (selectedDriverId) {
    return (
      <DriverDetailPanel
        driverId={selectedDriverId}
        onClose={() => { setSelectedDriverId(null); loadData(); }}
        onUpdate={loadData}
      />
    );
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton h-8 w-28 mb-2" />
        <div className="skeleton h-4 w-40 mb-8" />
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className={`flex flex-col sm:flex-row sm:items-center gap-4 mb-8 ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Drivers</h1>
            <p className="text-[14px] text-[#868E96] mt-1">{drivers.length} drivers in your fleet</p>
          </div>
        )}
        <button onClick={() => { setShowForm(!showForm); setNewDriverCredentials(null); }} className="apple-btn apple-btn-primary w-full sm:w-auto">
          <Plus size={16} /> Add Driver
        </button>
      </div>

      {newDriverCredentials && (
        <div className="apple-card p-6 mb-6 max-w-lg animate-slide-up">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#34c759]/10 flex items-center justify-center shrink-0">
              <KeyRound size={18} className="text-[#34c759]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#111315]">Driver account created</h3>
              <p className="text-[12px] text-[#868E96] mt-0.5">
                Share these login details with <span className="font-medium text-[#111315]">{newDriverCredentials.name}</span> so they can sign in on their device.
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-[#F1F3F5] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider">Email</p>
                <p className="text-[14px] text-[#111315] font-mono">{newDriverCredentials.email}</p>
              </div>
              <button
                onClick={() => copyToClipboard(newDriverCredentials.email, "email")}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/80 transition-colors"
              >
                {copiedField === "email" ? <Check size={14} className="text-[#34c759]" /> : <Copy size={14} className="text-[#868E96]" />}
              </button>
            </div>
            <div className="h-px bg-black/[0.06]" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[#868E96] font-medium uppercase tracking-wider">Password</p>
                <p className="text-[14px] text-[#111315] font-mono">{newDriverCredentials.password}</p>
              </div>
              <button
                onClick={() => copyToClipboard(newDriverCredentials.password, "password")}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/80 transition-colors"
              >
                {copiedField === "password" ? <Check size={14} className="text-[#34c759]" /> : <Copy size={14} className="text-[#868E96]" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setNewDriverCredentials(null)}
            className="text-[12px] text-[#868E96] hover:text-[#111315] mt-3 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <div className="apple-card p-6 mb-6 max-w-lg animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-[#111315]">New Driver</h3>
            <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full bg-[#F1F3F5] flex items-center justify-center hover:bg-[#e5e5ea] transition-colors">
              <X size={14} className="text-[#868E96]" />
            </button>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#F1F3F5] mb-4">
            <Shield size={14} className="text-[#868E96] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#868E96] leading-relaxed">
              A login account is automatically created so the driver can sign in and view assigned jobs on their device.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[12px] text-[#868E96] font-medium mb-1 block">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sipho Ndlovu" className="apple-input" />
            </div>
            <div>
              <label className="text-[12px] text-[#868E96] font-medium mb-1 block">Email (used for login)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="sipho@gmail.com" className="apple-input" />
            </div>
            <div>
              <label className="text-[12px] text-[#868E96] font-medium mb-1 block">Password (optional)</label>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Auto-generated" className="apple-input" />
            </div>
            <div>
              <label className="text-[12px] text-[#868E96] font-medium mb-1.5 block">Vehicle type</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "van", label: "Van", icon: Container },
                  { value: "truck", label: "Truck", icon: Truck },
                  { value: "car", label: "Car", icon: Car },
                  { value: "bike", label: "Bike", icon: Bike },
                ].map(({ value, label, icon: VIcon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, vehicle_type: value })}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      form.vehicle_type === value
                        ? "border-[#008080] bg-[#008080]/[0.04]"
                        : "border-transparent bg-[#F1F3F5] hover:bg-[#ebebed]"
                    }`}
                  >
                    <VIcon
                      size={22}
                      strokeWidth={1.6}
                      className={form.vehicle_type === value ? "text-[#008080]" : "text-[#868E96]"}
                    />
                    <span className={`text-[11px] font-medium ${
                      form.vehicle_type === value ? "text-[#008080]" : "text-[#868E96]"
                    }`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleAdd} disabled={adding || !form.name.trim() || !form.email.trim()} className="apple-btn apple-btn-primary">
                {adding ? <><Spinner size={14} /> Adding...</> : "Add Driver"}
              </button>
              <button onClick={() => setShowForm(false)} className="apple-btn apple-btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#ff3b30] mb-4">{error}</p>
          <button onClick={() => { setLoading(true); loadData(); }} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      ) : drivers.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-4">
            <Truck size={24} className="text-[#c7c7cc]" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] text-[#868E96] mb-1">No drivers yet</p>
          <p className="text-[12px] text-[#ADB5BD] mb-4">Add drivers to assign them jobs. Each driver gets a login account.</p>
          <button onClick={() => setShowForm(true)} className="apple-btn apple-btn-primary">
            Add your first driver
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {drivers.map((driver, i) => {
            const driverJobs = jobs.filter(j => j.driver_id === driver.id);
            const completedJobs = driverJobs.filter(j => j.status === "completed");
            return (
              <div key={driver.id}
                onClick={() => setSelectedDriverId(driver.id)}
                className="apple-card p-4 flex items-center gap-4 animate-fade-in cursor-pointer hover:shadow-md transition-shadow"
                style={{ animationDelay: `${i * 40}ms` }}>
                <div className="w-10 h-10 rounded-xl bg-[#F1F3F5] flex items-center justify-center shrink-0">
                  <VehicleIcon type={driver.vehicle_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-[#111315]">{driver.name}</p>
                    {driver.blocked && (
                      <span className="px-1.5 py-0.5 rounded-md bg-[#ff3b30]/10 text-[10px] font-semibold text-[#ff3b30]">BLOCKED</span>
                    )}
                    {driver.has_account && !driver.blocked && (
                      <span className="px-1.5 py-0.5 rounded-md bg-[#34c759]/10 text-[10px] font-semibold text-[#34c759]">APP</span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#ADB5BD]">
                    {driver.vehicle_type}
                    {driver.email && <span className="hidden sm:inline"> &middot; {driver.email}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  {driverJobs.length > 0 ? (
                    <div className="text-right hidden sm:block">
                      <span className="text-[12px] font-semibold text-[#111315]">{driverJobs.length} job{driverJobs.length !== 1 ? "s" : ""}</span>
                      {completedJobs.length > 0 && (
                        <p className="text-[11px] text-[#868E96]">{completedJobs.length} completed</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-[12px] text-[#ADB5BD] hidden sm:inline">No jobs</span>
                  )}
                  <button onClick={(e) => handleRemove(e, driver.id)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#ff3b30]/10 transition-colors">
                    <Trash2 size={14} className="text-[#DEE2E6]" />
                  </button>
                  <ChevronRight size={16} className="text-[#DEE2E6]" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
