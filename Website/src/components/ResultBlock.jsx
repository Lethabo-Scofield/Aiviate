import { AlertCircle, CheckCircle2, MapPin, Send } from "lucide-react";
import MiniRouteMap from "./MiniRouteMap";

function ActionReceipt({ action }) {
  const details = action.details || {};
  if (!details.title && !details.inputs && !details.steps) {
    return (
      <div className="text-[12px] flex items-start gap-2">
        <span className="text-[#008080] mt-0.5">▸</span>
        <span className="text-[#111315]">{action.summary}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[#008080]">
            {details.status || "Completed"}
          </p>
          <p className="text-[13.5px] font-semibold text-[#111315] mt-0.5">
            {details.title || action.summary}
          </p>
        </div>
        {details.confidence && (
          <div className="text-right shrink-0">
            <p className="text-[10.5px] text-[#868E96]">Confidence</p>
            <p className="text-[13px] font-semibold text-[#111315]">{details.confidence}%</p>
          </div>
        )}
      </div>

      {details.owner && (
        <div className="rounded-lg bg-[#F1F3F5] px-3 py-2">
          <p className="text-[10.5px] text-[#868E96]">Owner</p>
          <p className="text-[12.5px] font-medium text-[#111315]">{details.owner}</p>
        </div>
      )}

      {details.inputs?.length > 0 && (
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#868E96] mb-1.5">Checked</p>
          <div className="grid gap-1.5">
            {details.inputs.map((item) => (
              <div key={item} className="flex items-start gap-2 text-[12px] text-[#111315]">
                <CheckCircle2 size={12} className="text-[#34c759] mt-0.5 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {details.steps?.length > 0 && (
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#868E96] mb-1.5">Steps</p>
          <div className="space-y-1.5">
            {details.steps.map((step, index) => (
              <div key={step} className="flex items-start gap-2 text-[12px] text-[#111315]">
                <span className="w-4 h-4 rounded-full bg-[#008080]/10 text-[#008080] text-[10px] font-semibold flex items-center justify-center shrink-0 mt-px">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {details.outcome && (
        <div className="rounded-lg bg-[#008080]/[0.06] px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#008080] mb-1">Outcome</p>
          <p className="text-[12.5px] text-[#111315] leading-snug">{details.outcome}</p>
        </div>
      )}

      {details.nextFocus && (
        <div className="rounded-lg bg-[#111315]/[0.04] px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#868E96] mb-1">Next focus</p>
          <p className="text-[12.5px] text-[#111315] leading-snug">{details.nextFocus}</p>
        </div>
      )}
    </div>
  );
}

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
            <span className="text-[#868E96]">— {c.does || c.description}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "greeting") {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-[#111315]">{result.summary}</p>
        <div className="grid gap-1.5">
          {result.items?.map((c, i) => (
            <div key={i} className="flex items-baseline gap-3 text-[12px]">
              <span className="text-[#008080] font-medium italic">"{c.phrase}"</span>
              <span className="text-[#868E96]">— {c.does}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (t === "autopilot" || t === "autopilot_run") {
    const settings = result.settings || {};
    const pending = result.pending_approvals || [];
    const recent = result.recent_actions || [];
    const actions = result.actions || [];
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-[13px] text-[#111315]">
          <CheckCircle2 size={14} className="text-[#008080] mt-0.5 shrink-0" />
          <span>{result.summary}</span>
        </div>
        {settings.mode && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#F1F3F5] px-3 py-2">
              <p className="text-[11px] text-[#868E96]">Mode</p>
              <p className="text-[13px] font-semibold capitalize text-[#111315]">{settings.mode}</p>
            </div>
            <div className="rounded-lg bg-[#F1F3F5] px-3 py-2">
              <p className="text-[11px] text-[#868E96]">State</p>
              <p className={`text-[13px] font-semibold ${settings.enabled ? "text-[#34c759]" : "text-[#ff9500]"}`}>
                {settings.enabled ? "On" : "Off"}
              </p>
            </div>
          </div>
        )}
        {pending.slice(0, 3).map((a) => (
          <div key={a.id} className="rounded-lg bg-[#ff9500]/[0.07] px-3 py-2 text-[12px] text-[#111315]">
            {a.summary}
          </div>
        ))}
        {(actions.length > 0 ? actions : recent).slice(0, 4).map((a, i) => (
          <div key={a.id || i} className="text-[12px] flex items-start gap-2">
            <span className="text-[#008080] mt-0.5">▸</span>
            <span className="text-[#111315]">{a.summary}</span>
          </div>
        ))}
        {(actions.length > 0 ? actions : recent)
          .filter((a) => a.details?.title || a.details?.inputs || a.details?.steps)
          .slice(0, 1)
          .map((a, i) => (
            <ActionReceipt key={`details-${a.id || i}`} action={a} />
          ))}
      </div>
    );
  }
  if (t === "stats") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {result.items?.map((s) => (
          <div key={s.label} className="rounded-lg bg-[#F1F3F5] px-3 py-2">
            <p className="text-[18px] font-semibold text-[#111315] leading-none">{s.value}</p>
            <p className="text-[11px] text-[#868E96] mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    );
  }
  if (t === "drivers") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#868E96]">No drivers.</p>}
        {result.items?.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-[#ADB5BD] w-32 truncate">{d.id}</span>
            <span className="text-[#111315] flex-1 truncate">{d.name}</span>
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
        {result.items?.length === 0 && <p className="text-[12px] text-[#868E96]">No jobs.</p>}
        {result.items?.map((j) => (
          <div key={j.id} className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-[#ADB5BD] w-36 truncate">{j.id}</span>
            <span className="text-[#111315] flex-1 truncate">{j.area} · {j.total_stops} stops</span>
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
        {result.items?.length === 0 && <p className="text-[12px] text-[#868E96]">No open alerts.</p>}
        {result.items?.map((a) => (
          <div key={a.id} className="text-[12px]">
            <span className="text-[11px] uppercase tracking-wider text-[#ff3b30] font-semibold mr-2">
              {a.severity}
            </span>
            <span className="text-[#111315]">{a.title}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "audit") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#868E96]">No audit entries.</p>}
        {result.items?.map((e, i) => (
          <div key={i} className="text-[12px] flex items-start gap-2">
            <span className="text-[#ADB5BD] font-mono text-[10px] w-20 shrink-0 truncate">{e.actor}</span>
            <span className="text-[#111315]">{e.summary}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "recommendations") {
    return (
      <div className="space-y-1">
        {result.items?.length === 0 && <p className="text-[12px] text-[#868E96]">No active recommendations.</p>}
        {result.items?.map((r) => (
          <div key={r.id} className="text-[12px]">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#ff9500] mr-2">{r.severity}</span>
            <span className="text-[#111315]">{r.what}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === "route_map") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[12px] text-[#111315]">
          <MapPin size={13} className="text-[#008080]" />
          <span>{result.summary}</span>
        </div>
        <MiniRouteMap routes={result.routes || []} height={260} />
        {(result.routes || []).length > 0 && (
          <div className="space-y-0.5">
            {(result.routes || []).map((r) => (
              <div key={r.job_id} className="text-[11px] font-mono text-[#868E96]">
                <span className="text-[#111315]">{r.job_id}</span>
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
      <div className="flex items-start gap-2 text-[13px] text-[#111315]">
        <Send size={14} className="text-[#008080] mt-0.5 shrink-0" />
        <div>
          <div>{result.summary}</div>
          {result.alert && (
            <div className="text-[11px] text-[#868E96] mt-0.5">
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
        <div className="flex items-start gap-2 text-[13px] text-[#111315]">
          <CheckCircle2 size={14} className="text-[#34c759] mt-0.5 shrink-0" />
          <span>{result.summary}</span>
        </div>
        {result.driver_notified && (
          <div className="flex items-start gap-2 text-[11px] text-[#868E96] pl-5">
            <Send size={11} className="text-[#008080] mt-0.5 shrink-0" />
            <span>In-app alert queued for driver: "{result.driver_notified.message}"</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-[13px] text-[#111315]">
      <CheckCircle2 size={14} className="text-[#34c759] mt-0.5 shrink-0" />
      <span>{result.summary}</span>
    </div>
  );
}
