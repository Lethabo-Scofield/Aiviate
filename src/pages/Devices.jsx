import { useEffect, useState } from "react";
import {
  Smartphone,
  Battery,
  BatteryLow,
  Wifi,
  WifiOff,
  Camera,
  CameraOff,
  Activity,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";
import {
  getDevices,
  getDrivers,
  addDevice,
  assignDevice,
  triggerDeviceOta,
  removeDevice,
} from "../services/api";

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function BatteryBadge({ pct }) {
  const low = pct < 20;
  const color = low ? "#ff3b30" : pct < 40 ? "#ff9500" : "#34c759";
  const Icon = low ? BatteryLow : Battery;
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={14} style={{ color }} strokeWidth={1.8} />
      <span className="text-[12px] font-semibold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function SignalBars({ strength }) {
  const bars = Math.round((strength / 100) * 4);
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((b) => (
        <div
          key={b}
          className="w-1 rounded-sm"
          style={{
            height: `${b * 25}%`,
            background: b <= bars ? "#34c759" : "#e5e5e7",
          }}
        />
      ))}
    </div>
  );
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("Aiviate Mobile");
  const [busy, setBusy] = useState(false);
  const [otaBusy, setOtaBusy] = useState({});

  const load = async () => {
    try {
      const [d, dr] = await Promise.all([getDevices(), getDrivers()]);
      setDevices(d.devices || []);
      setDrivers(dr.drivers || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const lowBattery = devices.filter((d) => d.battery_pct < 20).length;
  const updatesAvailable = devices.filter((d) => d.ota_status === "update_available").length;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await addDevice(newName.trim(), newModel.trim() || "Aiviate Mobile");
      setNewName("");
      setShowAdd(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (deviceId, driverId) => {
    await assignDevice(deviceId, driverId || null);
    load();
  };

  const handleOta = async (deviceId) => {
    setOtaBusy((p) => ({ ...p, [deviceId]: true }));
    try {
      await triggerDeviceOta(deviceId);
      load();
    } finally {
      setOtaBusy((p) => ({ ...p, [deviceId]: false }));
    }
  };

  const handleRemove = async (deviceId) => {
    if (!window.confirm("Remove this device?")) return;
    await removeDevice(deviceId);
    setDevices((p) => p.filter((d) => d.id !== deviceId));
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Devices</h1>
          <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">
            Manage driver telematics devices, battery & connectivity, and OTA firmware updates
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="apple-btn apple-btn-primary">
          <Plus size={15} /> Add device
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total devices", value: devices.length, color: "#1d1d1f" },
          { label: "Online", value: onlineCount, color: "#34c759" },
          { label: "Low battery", value: lowBattery, color: "#ff9500" },
          { label: "Updates available", value: updatesAvailable, color: "#0a84ff" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <p className="text-[11px] text-[#86868b] font-medium uppercase tracking-wide mb-2">{s.label}</p>
            <p className="text-[28px] font-semibold tracking-tight leading-none" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="apple-card p-5">
              <div className="skeleton h-4 w-40 mb-2" />
              <div className="skeleton h-3 w-72" />
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
            <Smartphone size={22} className="text-[#86868b]" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-semibold text-[#1d1d1f] mb-1">No devices yet</p>
          <p className="text-[13px] text-[#86868b] mb-4">Add a device to start tracking telemetry.</p>
          <button onClick={() => setShowAdd(true)} className="apple-btn apple-btn-primary">
            <Plus size={15} /> Add device
          </button>
        </div>
      ) : (
        <div className="apple-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#86868b] font-semibold border-b border-black/[0.06]">
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Battery</th>
                  <th className="px-5 py-3">Signal</th>
                  <th className="px-5 py-3">Sensors</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Firmware</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-b border-black/[0.04] last:border-0 hover:bg-[#fafafc]">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-[#1d1d1f]">{d.name}</p>
                      <p className="text-[11px] text-[#aeaeb2]">{d.model} • {d.id}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${d.status === "online" ? "bg-[#34c759]" : "bg-[#aeaeb2]"}`}
                          style={d.status === "online" ? { animation: "pulseGlow 2s ease-in-out infinite" } : undefined}
                        />
                        <span className="text-[12px] font-medium text-[#3a3a3c] capitalize">{d.status}</span>
                      </div>
                      <p className="text-[10px] text-[#aeaeb2] mt-1">last seen {timeAgo(d.last_seen)}</p>
                    </td>
                    <td className="px-5 py-3"><BatteryBadge pct={d.battery_pct} /></td>
                    <td className="px-5 py-3">
                      {d.status === "offline" ? (
                        <WifiOff size={14} className="text-[#aeaeb2]" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <SignalBars strength={d.signal_strength} />
                          <span className="text-[11px] text-[#86868b]">{d.signal_strength}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span title={`Accelerometer: ${d.accel_status}`}>
                          <Activity size={14} style={{ color: d.accel_status === "ok" ? "#34c759" : "#ff9500" }} />
                        </span>
                        <span title={`Camera: ${d.camera_status}`}>
                          {d.camera_status === "ok" ? (
                            <Camera size={14} className="text-[#34c759]" />
                          ) : (
                            <CameraOff size={14} className="text-[#aeaeb2]" />
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={d.driver_id || ""}
                        onChange={(e) => handleAssign(d.id, e.target.value)}
                        className="text-[12px] bg-[#f5f5f7] border-0 rounded-lg px-2 py-1.5 max-w-[140px]"
                      >
                        <option value="">— Unassigned —</option>
                        {drivers.map((dr) => (
                          <option key={dr.id} value={dr.id}>{dr.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-mono text-[#3a3a3c]">{d.firmware_version}</span>
                        {d.ota_status === "update_available" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0a84ff]/10 text-[#0a84ff] font-semibold">
                            UPDATE
                          </span>
                        )}
                        {d.ota_status === "up_to_date" && (
                          <CheckCircle2 size={12} className="text-[#34c759]" />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {d.ota_status !== "up_to_date" && (
                          <button
                            onClick={() => handleOta(d.id)}
                            disabled={!!otaBusy[d.id]}
                            title="Trigger OTA"
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#0a84ff]/10 text-[#0a84ff]"
                          >
                            {otaBusy[d.id] ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(d.id)}
                          title="Remove"
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#ff3b30]/10 text-[#86868b] hover:text-[#ff3b30]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-semibold text-[#1d1d1f]">Add device</h2>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-lg hover:bg-black/[0.04] flex items-center justify-center">
                <X size={16} className="text-[#86868b]" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-[12px] font-semibold text-[#3a3a3c] mb-1 block">Device name</label>
                <input className="apple-input" placeholder="e.g. Cab tablet #4" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-[#3a3a3c] mb-1 block">Model</label>
                <input className="apple-input" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="apple-btn apple-btn-secondary">Cancel</button>
                <button type="submit" disabled={busy} className="apple-btn apple-btn-primary">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
