import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  ChevronRight,
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

function Device3DCard({ device, driverName }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rx: -8, ry: 14 });

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -y * 22, ry: x * 28 });
  };
  const onLeave = () => setTilt({ rx: -8, ry: 14 });

  const batteryColor = device.battery_pct < 20 ? "#ff3b30" : device.battery_pct < 40 ? "#ff9500" : "#34c759";
  const online = device.status === "online";

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative w-full flex items-center justify-center select-none"
      style={{ perspective: "1400px", height: 460 }}
    >
      <div className="absolute inset-x-10 bottom-6 h-8 rounded-full bg-black/30 blur-2xl opacity-50" />
      <div
        className="relative transition-transform duration-300"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {/* Phone body */}
        <div
          className="relative"
          style={{
            width: 220,
            height: 440,
            borderRadius: 38,
            background: "linear-gradient(145deg, #2a2a2c 0%, #1a1a1c 50%, #0a0a0c 100%)",
            boxShadow:
              "0 60px 100px -30px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.05) inset, 0 2px 0 rgba(255,255,255,0.12) inset",
            padding: 8,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Side buttons */}
          <div style={{ position: "absolute", left: -2, top: 110, width: 3, height: 28, borderRadius: 2, background: "#2a2a2c" }} />
          <div style={{ position: "absolute", left: -2, top: 148, width: 3, height: 50, borderRadius: 2, background: "#2a2a2c" }} />
          <div style={{ position: "absolute", left: -2, top: 208, width: 3, height: 50, borderRadius: 2, background: "#2a2a2c" }} />
          <div style={{ position: "absolute", right: -2, top: 160, width: 3, height: 70, borderRadius: 2, background: "#2a2a2c" }} />

          {/* Screen */}
          <div
            className="relative w-full h-full overflow-hidden flex flex-col"
            style={{
              borderRadius: 32,
              background: online
                ? "linear-gradient(180deg, #003a3a 0%, #002525 60%, #001515 100%)"
                : "linear-gradient(180deg, #1c1c1e 0%, #0a0a0a 100%)",
              boxShadow: "0 0 0 2px #000 inset",
              color: "white",
            }}
          >
            {/* Dynamic Island */}
            <div
              className="mx-auto mt-2"
              style={{
                width: 90,
                height: 26,
                borderRadius: 14,
                background: "#000",
              }}
            />

            {/* Status bar */}
            <div className="flex items-center justify-between px-5 mt-1 text-[10px] font-semibold opacity-90">
              <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <div className="flex items-center gap-1">
                {online ? <Wifi size={11} /> : <WifiOff size={11} />}
                <Battery size={13} style={{ color: batteryColor }} />
                <span style={{ color: batteryColor }}>{device.battery_pct}%</span>
              </div>
            </div>

            {/* App content */}
            <div className="flex-1 px-4 pt-6 flex flex-col items-center text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{
                  background: online ? "rgba(0,128,128,0.25)" : "rgba(255,255,255,0.08)",
                  boxShadow: online ? "0 0 20px rgba(0,180,180,0.4)" : "none",
                }}
              >
                <Smartphone size={22} className="text-white" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] font-semibold tracking-tight leading-tight">{device.name}</p>
              <p className="text-[10px] opacity-60 mt-0.5">{device.model}</p>

              <div className="mt-5 w-full space-y-2">
                <div className="flex items-center justify-between text-[10px] px-3 py-2 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70">Status</span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: online ? "#34c759" : "#86868b",
                        boxShadow: online ? "0 0 6px #34c759" : "none",
                      }}
                    />
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] px-3 py-2 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70">Signal</span>
                  <span className="font-semibold">{device.signal_strength}%</span>
                </div>
                <div className="flex items-center justify-between text-[10px] px-3 py-2 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70">Camera</span>
                  <span className="flex items-center gap-1 font-semibold">
                    {device.camera_status === "ok" ? <Camera size={11} /> : <CameraOff size={11} />}
                    {device.camera_status === "ok" ? "OK" : "Off"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] px-3 py-2 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70">Sensor</span>
                  <span className="font-semibold">{device.accel_status === "ok" ? "OK" : "Fault"}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] px-3 py-2 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70">Driver</span>
                  <span className="font-semibold truncate ml-2">{driverName || "Unassigned"}</span>
                </div>
              </div>
            </div>

            {/* Home indicator */}
            <div className="mx-auto mb-2" style={{ width: 90, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.55)" }} />
          </div>

          {/* Glare */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: 38,
              background:
                "linear-gradient(120deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.10) 100%)",
              mixBlendMode: "overlay",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function DeviceDetailSheet({ device, driverName, onClose, onOta, onRemove, otaBusy }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const titleId = `device-title-${device.id}`;
  return createPortal(
    <>
      <div className="ios-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-3xl shadow-2xl animate-pop overflow-y-auto"
        style={{ width: "min(900px, 94vw)", maxHeight: "92vh", zIndex: 9010 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* 3D phone */}
          <div
            className="relative hidden md:flex items-center justify-center py-8"
            style={{
              background: "radial-gradient(circle at 50% 40%, #fafafd 0%, #eef0f4 70%, #e4e6eb 100%)",
            }}
          >
            <Device3DCard device={device} driverName={driverName} />
            <p className="absolute bottom-3 text-[10px] text-[#aeaeb2] tracking-wide uppercase">Hover to tilt</p>
          </div>

          {/* Details */}
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#86868b] font-semibold">{device.id}</p>
                <h2 id={titleId} className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight mt-0.5">{device.name}</h2>
                <p className="text-[13px] text-[#86868b]">{device.model}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                autoFocus
                className="w-8 h-8 rounded-full bg-[#f0f0f0] hover:bg-[#e5e5e7] flex items-center justify-center tap"
              >
                <X size={14} className="text-[#86868b]" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-2xl bg-[#f5f5f7] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-1">Battery</p>
                <p className="text-[20px] font-semibold" style={{ color: device.battery_pct < 20 ? "#ff3b30" : device.battery_pct < 40 ? "#ff9500" : "#34c759" }}>
                  {device.battery_pct}%
                </p>
              </div>
              <div className="rounded-2xl bg-[#f5f5f7] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-1">Signal</p>
                <p className="text-[20px] font-semibold text-[#1d1d1f]">{device.signal_strength}%</p>
              </div>
              <div className="rounded-2xl bg-[#f5f5f7] p-3 col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-1">Firmware</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] text-[#1d1d1f]">{device.firmware_version}</span>
                  {device.ota_status === "update_available" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0a84ff]/10 text-[#0a84ff] font-semibold">UPDATE AVAILABLE</span>
                  )}
                  {device.ota_status === "up_to_date" && (
                    <span className="text-[10px] flex items-center gap-1 text-[#34c759] font-semibold">
                      <CheckCircle2 size={12} /> Up to date
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#86868b]">Status</span>
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#1d1d1f]">
                  <span className={`w-2 h-2 rounded-full ${device.status === "online" ? "bg-[#34c759]" : "bg-[#aeaeb2]"}`} />
                  {device.status === "online" ? "Online" : "Offline"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#86868b]">Last seen</span>
                <span className="text-[13px] text-[#1d1d1f]">{timeAgo(device.last_seen)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#86868b]">Camera</span>
                <span className="text-[13px] text-[#1d1d1f]">{device.camera_status === "ok" ? "OK" : "Faulty"}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#86868b]">Accelerometer</span>
                <span className="text-[13px] text-[#1d1d1f]">{device.accel_status === "ok" ? "OK" : "Faulty"}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#86868b]">Driver</span>
                <span className="text-[13px] text-[#1d1d1f]">{driverName || "Unassigned"}</span>
              </div>
            </div>

            <div className="flex gap-2">
              {device.ota_status !== "up_to_date" && (
                <button
                  onClick={() => onOta(device.id)}
                  disabled={!!otaBusy}
                  className="apple-btn apple-btn-primary flex-1"
                >
                  {otaBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Update firmware
                </button>
              )}
              <button
                onClick={async () => { const ok = await onRemove(device.id); if (ok) onClose(); }}
                className="apple-btn apple-btn-secondary text-[#ff3b30]"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
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
    if (!window.confirm("Remove this device?")) return false;
    await removeDevice(deviceId);
    setDevices((p) => p.filter((d) => d.id !== deviceId));
    return true;
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
                  <tr
                    key={d.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${d.name}`}
                    onClick={() => setSelectedId(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(d.id);
                      }
                    }}
                    className="border-b border-black/[0.04] last:border-0 hover:bg-[#fafafc] cursor-pointer transition-colors focus:outline-none focus-visible:bg-[#fafafc] focus-visible:ring-2 focus-visible:ring-[#008080]/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-[#1d1d1f]">{d.name}</p>
                          <p className="text-[11px] text-[#aeaeb2]">{d.model} • {d.id}</p>
                        </div>
                        <ChevronRight size={14} className="text-[#c7c7cc] ml-1" />
                      </div>
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
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
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
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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

      {selectedId && (() => {
        const dev = devices.find((d) => d.id === selectedId);
        if (!dev) return null;
        const drv = drivers.find((dr) => dr.id === dev.driver_id);
        return (
          <DeviceDetailSheet
            device={dev}
            driverName={drv?.name}
            otaBusy={!!otaBusy[dev.id]}
            onOta={handleOta}
            onRemove={handleRemove}
            onClose={() => setSelectedId(null)}
          />
        );
      })()}

      {showAdd && createPortal(
        <>
          <div className="ios-scrim" onClick={() => setShowAdd(false)} />
          <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-handle sm:hidden" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[18px] font-semibold text-[#1d1d1f] tracking-tight">Add device</h2>
                <button
                  onClick={() => setShowAdd(false)}
                  className="w-8 h-8 rounded-full bg-[#f0f0f0] hover:bg-[#e5e5e7] flex items-center justify-center tap"
                >
                  <X size={14} className="text-[#86868b]" />
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
                    {busy ? <span className="ios-spinner ios-spinner-inverse" /> : <Plus size={14} />} Add
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
