import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
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
  ShieldCheck,
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

function readinessFromDevice(device) {
  // Device readiness — how trustworthy this Guardian's fatigue inference
  // currently is, based on hardware health. This is NOT a measurement of
  // driver drowsiness; the edge ML inference is reported separately when
  // available.
  const base = device.status === "online" ? 92 : 0;
  const batteryPenalty = device.battery_pct < 20 ? 12 : 0;
  const sensorPenalty = device.accel_status === "ok" ? 0 : 8;
  const cameraPenalty = device.camera_status === "ok" ? 0 : 30;
  const seed = (device.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitter = (seed % 11) - 5;
  return Math.max(0, Math.min(100, base - batteryPenalty - sensorPenalty - cameraPenalty + jitter));
}

function readinessTier(score) {
  if (score >= 85) return { label: "Ready", color: "#34c759" };
  if (score >= 65) return { label: "Degraded", color: "#ff9500" };
  if (score > 0) return { label: "Faulty", color: "#ff3b30" };
  return { label: "Offline", color: "#86868b" };
}

// Back-compat aliases used widely below
const alertnessFromDevice = readinessFromDevice;
const alertnessTier = readinessTier;

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
  const alertness = alertnessFromDevice(device);
  const tier = alertnessTier(alertness);
  const eyeClosureRate = online ? Math.max(2, Math.min(45, 100 - alertness)) : 0;

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
                ? `linear-gradient(180deg, ${tier.color}33 0%, #0a1014 50%, #050709 100%)`
                : "linear-gradient(180deg, #1c1c1e 0%, #0a0a0a 100%)",
              boxShadow: "0 0 0 2px #000 inset",
              color: "white",
            }}
          >
            {/* Dynamic Island with IR camera dot */}
            <div
              className="mx-auto mt-2 relative flex items-center justify-center"
              style={{
                width: 90,
                height: 26,
                borderRadius: 14,
                background: "#000",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: online ? "#ff3b30" : "#3a3a3c",
                  boxShadow: online ? "0 0 6px #ff3b30" : "none",
                }}
                title="IR camera"
              />
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-5 mt-1 text-[10px] font-semibold opacity-90">
              <span>GUARDIAN</span>
              <div className="flex items-center gap-1">
                {online ? <Wifi size={11} /> : <WifiOff size={11} />}
                <Battery size={13} style={{ color: batteryColor }} />
                <span style={{ color: batteryColor }}>{device.battery_pct}%</span>
              </div>
            </div>

            {/* Live alertness readout */}
            <div className="flex-1 px-4 pt-4 flex flex-col items-center text-center">
              <p className="text-[9px] uppercase tracking-[0.15em] opacity-60 mb-2">Guardian readiness</p>
              <div className="relative" style={{ width: 110, height: 110 }}>
                <svg width="110" height="110" className="-rotate-90">
                  <circle cx="55" cy="55" r="48" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
                  <circle
                    cx="55" cy="55" r="48"
                    stroke={tier.color}
                    strokeWidth="6"
                    fill="none"
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - alertness / 100)}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease", filter: online ? `drop-shadow(0 0 6px ${tier.color})` : "none" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[26px] font-semibold leading-none tracking-tight">{online ? alertness : "—"}</span>
                  <span className="text-[9px] uppercase tracking-wider mt-1" style={{ color: tier.color }}>{tier.label}</span>
                </div>
              </div>

              <div className="mt-4 w-full space-y-1.5">
                <div className="flex items-center justify-between text-[10px] px-3 py-1.5 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70 flex items-center gap-1"><Eye size={10} /> Eye closure</span>
                  <span className="font-semibold">{online ? `${eyeClosureRate}%` : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] px-3 py-1.5 rounded-xl bg-white/[0.06]">
                  <span className="opacity-70 flex items-center gap-1"><Camera size={10} /> IR camera</span>
                  <span className="font-semibold">{device.camera_status === "ok" ? "Live" : "Off"}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] px-3 py-1.5 rounded-xl bg-white/[0.06]">
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

            {(() => {
              const a = alertnessFromDevice(device);
              const t = alertnessTier(a);
              return (
                <div className="rounded-2xl p-4 mb-4" style={{ background: `${t.color}0F`, border: `1px solid ${t.color}33` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: t.color }}>Guardian readiness</p>
                      <p className="text-[28px] font-semibold mt-0.5" style={{ color: t.color }}>{device.status === "online" ? a : "—"}<span className="text-[14px] opacity-60 ml-1">/100</span></p>
                      <p className="text-[12px] text-[#86868b] mt-0.5">{t.label} · drowsy-v{device.firmware_version}</p>
                    </div>
                    <Eye size={36} style={{ color: t.color, opacity: 0.3 }} />
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl bg-[#f5f5f7] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-1">Camera</p>
                <p className="text-[13px] font-semibold text-[#1d1d1f]">{device.camera_status === "ok" ? "Live" : "Faulty"}</p>
              </div>
              <div className="rounded-2xl bg-[#f5f5f7] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-1">Battery</p>
                <p className="text-[13px] font-semibold" style={{ color: device.battery_pct < 20 ? "#ff3b30" : device.battery_pct < 40 ? "#ff9500" : "#34c759" }}>{device.battery_pct}%</p>
              </div>
              <div className="rounded-2xl bg-[#f5f5f7] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#86868b] font-semibold mb-1">Signal</p>
                <p className="text-[13px] font-semibold text-[#1d1d1f]">{device.signal_strength}%</p>
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
                <span className="text-[12px] text-[#86868b]">Motion sensor</span>
                <span className="text-[13px] text-[#1d1d1f]">{device.accel_status === "ok" ? "OK" : "Faulty"}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#86868b]">Fatigue model</span>
                <span className="text-[13px] font-mono text-[#1d1d1f]">drowsy-v{device.firmware_version}</span>
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
                  Update model
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
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Guardians</h1>
          <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">
            In-cab fatigue cameras — watching every driver's eyes, in real time.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="apple-btn apple-btn-primary">
          <Plus size={15} /> Pair Guardian
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Guardians deployed", value: devices.length, color: "#1d1d1f" },
          { label: "Cameras live now", value: onlineCount, color: "#34c759" },
          { label: "Drivers protected", value: devices.filter((d) => d.driver_id).length, color: "#008080" },
          { label: "Need attention", value: lowBattery + updatesAvailable, color: "#ff9500" },
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
            <ShieldCheck size={22} className="text-[#86868b]" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-semibold text-[#1d1d1f] mb-1">No Guardians paired yet</p>
          <p className="text-[13px] text-[#86868b] mb-4">Pair a Guardian unit to start watching your drivers.</p>
          <button onClick={() => setShowAdd(true)} className="apple-btn apple-btn-primary">
            <Plus size={15} /> Pair Guardian
          </button>
        </div>
      ) : (
        <div className="apple-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#86868b] font-semibold border-b border-black/[0.06]">
                  <th className="px-5 py-3">Guardian</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Readiness</th>
                  <th className="px-5 py-3">Battery</th>
                  <th className="px-5 py-3">Signal</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Model</th>
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
                    <td className="px-5 py-3">
                      {(() => {
                        const a = alertnessFromDevice(d);
                        const t = alertnessTier(a);
                        return (
                          <div className="flex items-center gap-2">
                            <Eye size={13} style={{ color: t.color }} />
                            <span className="text-[12px] font-semibold" style={{ color: t.color }}>{d.status === "online" ? a : "—"}</span>
                            <span className="text-[10px] text-[#aeaeb2]">{t.label}</span>
                          </div>
                        );
                      })()}
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
                        <span className="text-[12px] text-[#3a3a3c]">{d.model}</span>
                        <span className="text-[10px] font-mono text-[#aeaeb2]">v{d.firmware_version}</span>
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
                <h2 className="text-[18px] font-semibold text-[#1d1d1f] tracking-tight">Pair a Guardian</h2>
                <button
                  onClick={() => setShowAdd(false)}
                  className="w-8 h-8 rounded-full bg-[#f0f0f0] hover:bg-[#e5e5e7] flex items-center justify-center tap"
                >
                  <X size={14} className="text-[#86868b]" />
                </button>
              </div>
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="text-[12px] font-semibold text-[#3a3a3c] mb-1 block">Unit label</label>
                  <input className="apple-input" placeholder="e.g. Cab #4 — Hilux GP-123" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-[#3a3a3c] mb-1 block">Hardware model</label>
                  <input className="apple-input" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="apple-btn apple-btn-secondary">Cancel</button>
                  <button type="submit" disabled={busy} className="apple-btn apple-btn-primary">
                    {busy ? <span className="ios-spinner ios-spinner-inverse" /> : <Plus size={14} />} Pair
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
