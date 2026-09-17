import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import {
  Eye,
  Battery,
  BatteryLow,
  Wifi,
  WifiOff,
  Camera,
  CameraOff,
  Activity,
  BellRing,
  BrainCircuit,
  Ear,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Vibrate,
  Video,
} from "lucide-react";
import {
  getDevices,
  addDevice,
  triggerDeviceOta,
  removeDevice,
} from "../services/api";

const DEFAULT_SIPHO_ANTI_SLEEP_DEVICE = {
  id: "DEV-SIPHO-EAR-01",
  name: "Sipho Anti-Sleep Alarm",
  model: "Aiviate Ear Alert",
  status: "online",
  battery_pct: 94,
  signal_strength: 88,
  accel_status: "ok",
  camera_status: "offline",
  ota_status: "up_to_date",
  firmware_version: "1.1.0",
  driver_id: "DRV-DEMO003",
  driver_name: "Sipho Khumalo",
  last_seen: new Date().toISOString(),
};

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
  const color = low ? "#343A40" : pct < 40 ? "#868E96" : "#5C636A";
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
            background: b <= bars ? "#5C636A" : "#E9ECEF",
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
  if (score >= 85) return { label: "Ready", color: "#5C636A" };
  if (score >= 65) return { label: "Degraded", color: "#868E96" };
  if (score > 0) return { label: "Faulty", color: "#343A40" };
  return { label: "Offline", color: "#868E96" };
}

function deviceKind(device) {
  const model = (device.model || "").toLowerCase();
  if (model.includes("anti-sleep")) {
    return {
      label: "Anti-sleep alarm",
      Icon: Ear,
      role: "Vibration and audible fatigue warning",
      capability: "Driver wake alert",
    };
  }
  if (model.includes("dashcam")) {
    return {
      label: "Dashcam ML",
      Icon: Video,
      role: "Driver-facing computer vision observations",
      capability: "ML observation",
    };
  }
  return {
    label: "Guardian device",
    Icon: ShieldCheck,
    role: "Mobile safety telemetry",
    capability: "Safety telemetry",
  };
}

// Back-compat aliases used widely below
const alertnessFromDevice = readinessFromDevice;
const alertnessTier = readinessTier;

function SafetyHardwareCard({ title, status, body, Icon, checks = [], action }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgba(17,19,21,0.03)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#111315]">
          <Icon size={19} strokeWidth={1.55} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-[#111315]">{title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#5C636A]">{body}</p>
            </div>
            <span className="shrink-0 rounded-full border border-[#DEE2E6] bg-[#F8F9FA] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#5C636A]">
              {status}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {checks.map(({ icon: CheckIcon, label }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl bg-[#F8F9FA] px-3 py-2 text-[12px] text-[#343A40]">
                <CheckIcon size={14} strokeWidth={1.6} className="shrink-0 text-[#111315]" />
                <span>{label}</span>
              </div>
            ))}
          </div>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function DeviceInventoryCard({ device, drivers, onOpen, onAssign, onOta, onRemove, otaBusy }) {
  const kind = deviceKind(device);
  const KindIcon = kind.Icon;
  const readiness = readinessFromDevice(device);
  const tier = readinessTier(readiness);
  const online = device.status === "online";

  return (
    <article className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgba(17,19,21,0.03)] transition-colors hover:border-[#ADB5BD]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#111315]">
              <KindIcon size={20} strokeWidth={1.55} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[14px] font-semibold text-[#111315]">{device.name}</h3>
                <span className="rounded-full border border-[#DEE2E6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5C636A]">
                  {kind.label}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[#868E96]">{kind.role}</p>
              <p className="mt-2 font-mono text-[10.5px] text-[#ADB5BD]">{device.id} · {device.model}</p>
            </div>
          </div>
          <span className={`mt-1 flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold capitalize ${
            online ? "bg-[#F1F3F5] text-[#111315]" : "bg-[#F8F9FA] text-[#868E96]"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#5C636A]" : "bg-[#ADB5BD]"}`} />
            {device.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#F8F9FA] px-3 py-2">
            <p className="text-[10px] uppercase text-[#868E96] font-semibold">Readiness</p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: tier.color }}>{online ? readiness : "—"} {online ? tier.label : "Offline"}</p>
          </div>
          <div className="rounded-xl bg-[#F8F9FA] px-3 py-2">
            <p className="text-[10px] uppercase text-[#868E96] font-semibold">Battery</p>
            <p className="mt-1 text-[13px] font-semibold text-[#111315]">{device.battery_pct}%</p>
          </div>
          <div className="rounded-xl bg-[#F8F9FA] px-3 py-2">
            <p className="text-[10px] uppercase text-[#868E96] font-semibold">Signal</p>
            <p className="mt-1 text-[13px] font-semibold text-[#111315]">{online ? `${device.signal_strength}%` : "—"}</p>
          </div>
        </div>
      </button>

      <div className="mt-4 flex flex-col gap-3 border-t border-black/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-[#868E96] font-semibold">Assigned driver</p>
          <select
            value={device.driver_id || ""}
            onChange={(e) => onAssign(device.id, e.target.value)}
            className="mt-1 w-full min-w-[180px] rounded-xl border border-[#DEE2E6] bg-[#F8F9FA] px-3 py-2 text-[12px] text-[#111315] sm:w-auto"
          >
            <option value="">Unassigned</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          {device.ota_status !== "up_to_date" && (
            <button
              type="button"
              onClick={() => onOta(device.id)}
              disabled={!!otaBusy}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#111315] hover:bg-[#E9ECEF]"
              title="Update model"
            >
              {otaBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(device.id)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#868E96] hover:bg-[#E9ECEF] hover:text-[#111315]"
            title="Remove device"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
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

  const batteryColor = device.battery_pct < 20 ? "#343A40" : device.battery_pct < 40 ? "#868E96" : "#5C636A";
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
                  background: online ? "#343A40" : "#343A40",
                  boxShadow: online ? "0 0 6px #343A40" : "none",
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
            <p className="absolute bottom-3 text-[10px] text-[#ADB5BD] tracking-wide uppercase">Hover to tilt</p>
          </div>

          {/* Details */}
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#868E96] font-semibold">{device.id}</p>
                <h2 id={titleId} className="text-[22px] font-semibold text-[#111315] tracking-tight mt-0.5">{device.name}</h2>
                <p className="text-[13px] text-[#868E96]">{device.model}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                autoFocus
                className="w-8 h-8 rounded-full bg-[#F1F3F5] hover:bg-[#E9ECEF] flex items-center justify-center tap"
              >
                <X size={14} className="text-[#868E96]" />
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
                      <p className="text-[12px] text-[#868E96] mt-0.5">{t.label} · drowsy-v{device.firmware_version}</p>
                    </div>
                    <Eye size={36} style={{ color: t.color, opacity: 0.3 }} />
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl bg-[#F1F3F5] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#868E96] font-semibold mb-1">Camera</p>
                <p className="text-[13px] font-semibold text-[#111315]">{device.camera_status === "ok" ? "Live" : "Faulty"}</p>
              </div>
              <div className="rounded-2xl bg-[#F1F3F5] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#868E96] font-semibold mb-1">Battery</p>
                <p className="text-[13px] font-semibold" style={{ color: device.battery_pct < 20 ? "#343A40" : device.battery_pct < 40 ? "#868E96" : "#5C636A" }}>{device.battery_pct}%</p>
              </div>
              <div className="rounded-2xl bg-[#F1F3F5] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#868E96] font-semibold mb-1">Signal</p>
                <p className="text-[13px] font-semibold text-[#111315]">{device.signal_strength}%</p>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#868E96]">Status</span>
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#111315]">
                  <span className={`w-2 h-2 rounded-full ${device.status === "online" ? "bg-[#5C636A]" : "bg-[#ADB5BD]"}`} />
                  {device.status === "online" ? "Online" : "Offline"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#868E96]">Last seen</span>
                <span className="text-[13px] text-[#111315]">{timeAgo(device.last_seen)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#868E96]">Motion sensor</span>
                <span className="text-[13px] text-[#111315]">{device.accel_status === "ok" ? "OK" : "Faulty"}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#868E96]">Fatigue model</span>
                <span className="text-[13px] font-mono text-[#111315]">drowsy-v{device.firmware_version}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-[#868E96]">Driver</span>
                <span className="text-[13px] text-[#111315]">{driverName || "Unassigned"}</span>
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
                className="apple-btn apple-btn-secondary text-[#343A40]"
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

function CleanDeviceRow({ device, onOta, onRemove, otaBusy }) {
  const kind = deviceKind(device);
  const KindIcon = kind.Icon;
  const driverName = device.driver_name || "Unassigned";
  const online = device.status === "online";
  const readiness = readinessFromDevice(device);

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white">
            <KindIcon size={20} strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold text-white">{device.name}</h3>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                {kind.label}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-white/55">{device.model}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${
            online ? "bg-white/10 text-white" : "bg-white/[0.04] text-white/45"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-white" : "bg-white/35"}`} />
            {online ? "Online" : "Offline"}
          </span>
          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] text-white/65">
            Battery {device.battery_pct}%
          </span>
          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] text-white/65">
            Ready {online ? `${readiness}%` : "—"}
          </span>
          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] text-white/65">
            Seen {timeAgo(device.last_seen)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/40">Assigned to</span>
          <p className="rounded-xl border border-white/10 bg-[#111315] px-3 py-2 text-[13px] text-white md:max-w-xs">
            {driverName}
          </p>
        </div>

        <div className="flex gap-2">
          {device.ota_status !== "up_to_date" && (
            <button
              type="button"
              onClick={() => onOta(device.id)}
              disabled={!!otaBusy}
              className="apple-btn apple-btn-secondary text-[12px]"
            >
              {otaBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Update
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(device.id)}
            className="apple-btn apple-btn-secondary text-[12px]"
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

function AntiSleepDeviceModel() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.2, 7);

    const group = new THREE.Group();
    scene.add(group);

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x101214,
      roughness: 0.42,
      metalness: 0.15,
      clearcoat: 0.65,
      clearcoatRoughness: 0.25,
    });
    const innerMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2f3438,
      roughness: 0.55,
      metalness: 0.05,
    });
    const accentMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xdfe5ea,
      roughness: 0.25,
      metalness: 0.35,
      clearcoat: 0.75,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f7f9 });

    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.13, 24, 96, Math.PI * 1.35),
      bodyMaterial
    );
    hook.rotation.set(0.25, 0.1, -0.62);
    hook.position.set(-0.15, 0.25, 0);
    group.add(hook);

    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.15, 18, 36), bodyMaterial);
    pod.rotation.set(0.2, 0, -0.34);
    pod.position.set(1.05, -0.55, 0);
    group.add(pod);

    const speaker = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 36), innerMaterial);
    speaker.rotation.set(Math.PI / 2, 0, -0.34);
    speaker.position.set(1.23, -0.2, 0.49);
    group.add(speaker);

    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), glowMaterial);
    sensor.position.set(0.85, -0.98, 0.5);
    group.add(sensor);

    const vibrationBand = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 12, 48), accentMaterial);
    vibrationBand.rotation.set(1.4, 0.22, -0.34);
    vibrationBand.position.set(1.05, -0.55, 0.02);
    group.add(vibrationBand);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const fillLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
    rimLight.position.set(-4, 1, -3);
    scene.add(rimLight);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    let frame = 0;
    let rafId = 0;
    const animate = () => {
      frame += 0.012;
      group.rotation.y = Math.sin(frame) * 0.32;
      group.rotation.x = -0.08 + Math.sin(frame * 0.7) * 0.05;
      sensor.scale.setScalar(1 + Math.sin(frame * 4) * 0.12);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      renderer.dispose();
      [hook, pod, speaker, sensor, vibrationBand].forEach((mesh) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material.dispose();
      });
    };
  }, []);

  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.16),rgba(255,255,255,0.035)_52%,rgba(255,255,255,0.02)_100%)]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="3D model of Aiviate Ear Alert anti-sleep device" />
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 backdrop-blur">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Aiviate Ear Alert</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          Paired
        </span>
      </div>
    </div>
  );
}

export default function Devices({ embedded = false }) {
  const [devices, setDevices] = useState([DEFAULT_SIPHO_ANTI_SLEEP_DEVICE]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("Aiviate Mobile");
  const [busy, setBusy] = useState(false);
  const [otaBusy, setOtaBusy] = useState({});

  const load = async () => {
    try {
      const d = await getDevices();
      const incoming = d.devices || [];
      const hasSiphoAlarm = incoming.some((device) => {
        const text = `${device.name || ""} ${device.model || ""}`.toLowerCase();
        return text.includes("anti-sleep") || text.includes("anti sleep") || text.includes("ear alert");
      });
      setDevices(hasSiphoAlarm ? incoming : [DEFAULT_SIPHO_ANTI_SLEEP_DEVICE, ...incoming]);
    } catch (error) {
      console.error(error);
      setDevices((current) => current.length ? current : [DEFAULT_SIPHO_ANTI_SLEEP_DEVICE]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const antiSleepAlarm = devices.find((d) => {
    const text = `${d.name || ""} ${d.model || ""}`.toLowerCase();
    return text.includes("anti-sleep") || text.includes("anti sleep") || text.includes("ear alert");
  });
  const dashcam = devices.find((d) => `${d.name || ""} ${d.model || ""}`.toLowerCase().includes("dashcam"));

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
      <div className={`mb-6 sm:mb-8 flex items-start flex-wrap gap-4 ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Devices</h1>
          </div>
        )}
        <button onClick={() => setShowAdd(true)} className="apple-btn apple-btn-primary">
          <Plus size={15} /> Pair device
        </button>
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
      ) : (
        <div className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-[#111315] p-5 text-white shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-stretch">
              <div>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Paired device</p>
                    <h2 className="mt-2 text-[22px] font-semibold tracking-tight">Sipho's anti-sleep device</h2>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white">
                    <Ear size={14} /> Connected
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <CleanDeviceRow
                    device={antiSleepAlarm || DEFAULT_SIPHO_ANTI_SLEEP_DEVICE}
                    otaBusy={!!otaBusy[(antiSleepAlarm || DEFAULT_SIPHO_ANTI_SLEEP_DEVICE).id]}
                    onOta={handleOta}
                    onRemove={handleRemove}
                  />
                </div>
              </div>
              <AntiSleepDeviceModel />
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#111315]">
                  <Video size={18} strokeWidth={1.6} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-[#111315]">Dashcam ML</h3>
                    <span className="rounded-full border border-[#DEE2E6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#868E96]">
                      {dashcam ? "Paired" : "Planned"}
                    </span>
                  </div>
                </div>
              </div>
              {!dashcam && (
                <button
                  type="button"
                  onClick={() => {
                    setNewModel("Aiviate Dashcam ML");
                    setNewName("Sipho Dashcam");
                    setShowAdd(true);
                  }}
                  className="apple-btn apple-btn-secondary text-[12px]"
                >
                  <Plus size={14} /> Pair dashcam
                </button>
              )}
            </div>
            {dashcam && (
              <div className="mt-3">
                <CleanDeviceRow
                  device={dashcam}
                  otaBusy={!!otaBusy[dashcam.id]}
                  onOta={handleOta}
                  onRemove={handleRemove}
                />
              </div>
            )}
          </section>
        </div>
      )}

      {showAdd && createPortal(
        <>
          <div className="ios-scrim" onClick={() => setShowAdd(false)} />
          <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-handle sm:hidden" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[18px] font-semibold text-[#111315] tracking-tight">Pair a Guardian</h2>
                <button
                  onClick={() => setShowAdd(false)}
                  className="w-8 h-8 rounded-full bg-[#F1F3F5] hover:bg-[#E9ECEF] flex items-center justify-center tap"
                >
                  <X size={14} className="text-[#868E96]" />
                </button>
              </div>
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="text-[12px] font-semibold text-[#343A40] mb-1 block">Unit label</label>
                  <input className="apple-input" placeholder="e.g. Cab #4 — Hilux GP-123" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-[#343A40] mb-1 block">Hardware model</label>
                  <select className="apple-input" value={newModel} onChange={(e) => setNewModel(e.target.value)}>
                    <option>Aiviate Mobile</option>
                    <option>Aiviate Anti-Sleep Alarm</option>
                    <option>Aiviate Dashcam ML</option>
                    <option>Aiviate Guardian Combo</option>
                  </select>
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
