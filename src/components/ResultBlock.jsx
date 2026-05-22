import { AlertCircle, CheckCircle2, MapPin, Send } from "lucide-react";
import MiniRouteMap from "./MiniRouteMap";

/**
 * Renders a single backend command result inside the Home chat surface
 * (or anywhere else). Pure presentation; no side effects.
 */
export default function ResultBlock({ result }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <div className="flex items-start gap-2 text-[13px] text-[#ff3b30]">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <span>{result.summary}</span>
      </div>
    );
  }
  const t = result.type;

  if (t === "help") {
    return (
      <div className="space-y-1.5">
        {result.items?.map((c, i) => (
          <div key={i} className="flex items-baseline gap-3 text-[12px]">
            <span className="text-[#008080] font-medium italic">"{c.phrase || c.command}"</span>
            <span className="text-[#86868b]">— {c.does || c.description}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "stats") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {result.items?.map((s) => (
          <div key={s.label} className="rounded-lg bg-[#f5f5f7] px-3 py-2">
            <p className="text-[18px] font-semibold text-[#1d1d1f] leading-none">{s.value}</p>
            <p className="text-[11px] text-[#86868b] mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    );
  }
  if (t === "drivers") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#86868b]">No drivers.</p>}
        {result.items?.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-[#aeaeb2] w-32 truncate">{d.id}</span>
            <span className="text-[#1d1d1f] flex-1 truncate">{d.name}</span>
            <span className={`text-[11px] uppercase tracking-wider ${d.blocked ? "text-[#ff3b30]" : "text-[#34c759]"}`}>
              {d.blocked ? "blocked" : d.status || "available"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "jobs") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#86868b]">No jobs.</p>}
        {result.items?.map((j) => (
          <div key={j.id} className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-[#aeaeb2] w-36 truncate">{j.id}</span>
            <span className="text-[#1d1d1f] flex-1 truncate">{j.area} · {j.total_stops} stops</span>
            <span className={`text-[11px] uppercase tracking-wider ${j.status === "unassigned" ? "text-[#ff9500]" : "text-[#34c759]"}`}>
              {j.driver_name || j.status}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "alerts") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#86868b]">No open alerts.</p>}
        {result.items?.map((a) => (
          <div key={a.id} className="text-[12px]">
            <span className="text-[11px] uppercase tracking-wider text-[#ff3b30] font-semibold mr-2">
              {a.severity}
            </span>
            <span className="text-[#1d1d1f]">{a.title}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "audit") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#86868b]">No audit entries.</p>}
        {result.items?.map((e, i) => (
          <div key={i} className="text-[12px] flex items-start gap-2">
            <span className="text-[#aeaeb2] font-mono text-[10px] w-20 shrink-0 truncate">{e.actor}</span>
            <span className="text-[#1d1d1f]">{e.summary}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "recommendations") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#86868b]">No active recommendations.</p>}
        {result.items?.map((r) => (
          <div key={r.id} className="text-[12px]">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#ff9500] mr-2">{r.severity}</span>
            <span className="text-[#1d1d1f]">{r.what}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "route_map") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[12px] text-[#1d1d1f]">
          <MapPin size={13} className="text-[#008080]" />
          <span>{result.summary}</span>
        </div>
        <MiniRouteMap routes={result.routes || []} height={260} />
        {(result.routes || []).length > 0 && (
          <div className="space-y-0.5">
            {(result.routes || []).map((r) => (
              <div key={r.job_id} className="text-[11px] font-mono text-[#86868b]">
                <span className="text-[#1d1d1f]">{r.job_id}</span>
                {" · "}{r.stops.length} stops
                {r.driver_name && <> · {r.driver_name}</>}
                {r.total_distance_km ? <> · {r.total_distance_km} km</> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (t === "notify_result") {
    return (
      <div className="flex items-start gap-2 text-[13px] text-[#1d1d1f]">
        <Send size={14} className="text-[#008080] mt-0.5 shrink-0" />
        <div>
          <div>{result.summary}</div>
          {result.alert && (
            <div className="text-[11px] text-[#86868b] mt-0.5">
              "{result.alert.message}"
            </div>
          )}
        </div>
      </div>
    );
  }
  if (t === "optimization" || t === "optimization_bulk" || t === "assign_result") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-start gap-2 text-[13px] text-[#1d1d1f]">
          <CheckCircle2 size={14} className="text-[#34c759] mt-0.5 shrink-0" />
          <span>{result.summary}</span>
        </div>
        {result.driver_notified && (
          <div className="flex items-start gap-2 text-[11px] text-[#86868b] pl-5">
            <Send size={11} className="text-[#008080] mt-0.5 shrink-0" />
            <span>In-app alert queued for driver: "{result.driver_notified.message}"</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-[13px] text-[#1d1d1f]">
      <CheckCircle2 size={14} className="text-[#34c759] mt-0.5 shrink-0" />
      <span>{result.summary}</span>
    </div>
  );
}
