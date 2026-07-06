import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  Route as RouteIcon,
  MapPin,
  Clock,
  Gauge,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import { getEngineStatus, optimizeWithEngine, dispatchWithEngine } from "../services/api";

function formatEta(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] px-5 py-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#008080]/10 flex items-center justify-center flex-shrink-0">
        <Icon size={17} className="text-[#008080]" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-[#aeaeb2] font-semibold">{label}</p>
        <p className="text-[17px] font-semibold text-[#1d1d1f] leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

export default function AIPlanner() {
  const [engineUp, setEngineUp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);

  useEffect(() => {
    let alive = true;
    getEngineStatus()
      .then((r) => alive && setEngineUp(!!r.available))
      .catch(() => alive && setEngineUp(false));
    return () => {
      alive = false;
    };
  }, []);

  async function runPlanner() {
    setLoading(true);
    setError("");
    setPlan(null);
    setDispatchResult(null);
    try {
      const result = await optimizeWithEngine();
      setPlan(result);
    } catch (e) {
      setError(e.message || "The AI Planner could not build a plan.");
    } finally {
      setLoading(false);
    }
  }

  async function assignAndSave() {
    setDispatching(true);
    setError("");
    try {
      const result = await dispatchWithEngine();
      setDispatchResult(result);
    } catch (e) {
      setError(e.message || "Could not assign drivers and save jobs.");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="max-w-[980px] mx-auto px-5 lg:px-8 py-8 lg:py-10">
      <div className="flex items-start gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-[#008080] flex items-center justify-center flex-shrink-0">
          <Sparkles size={20} className="text-white" strokeWidth={1.9} />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold text-[#1d1d1f] tracking-tight leading-tight">
            AI Planner
          </h1>
          <p className="text-[14px] text-[#86868b] mt-0.5">
            Optimise today's stops into efficient driver routes with the OR-Tools decision engine.
          </p>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-black/[0.06] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full ${
                engineUp === null
                  ? "bg-[#d1d1d6]"
                  : engineUp
                  ? "bg-[#34c759]"
                  : "bg-[#ff3b30]"
              }`}
            />
            <span className="text-[13px] text-[#86868b]">
              {engineUp === null
                ? "Checking engine…"
                : engineUp
                ? "Decision engine online"
                : "Decision engine offline"}
            </span>
          </div>

          <button
            onClick={runPlanner}
            disabled={loading || engineUp === false}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1d1d1f] text-white text-[13px] font-medium disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Planning routes…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Run AI Planner
              </>
            )}
          </button>
        </div>

        <p className="text-[12px] text-[#aeaeb2] mt-4 leading-relaxed">
          The planner reads all geocoded stops for your company, then computes optimal delivery
          routes across the available fleet. This can take a few seconds while the solver runs.
        </p>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 bg-[#ff3b30]/[0.06] border border-[#ff3b30]/20 rounded-2xl px-5 py-4">
          <AlertTriangle size={18} className="text-[#ff3b30] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#1d1d1f]">{error}</p>
        </div>
      )}

      {plan && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-6 space-y-5"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={RouteIcon} label="Routes" value={plan.routes?.length ?? 0} />
            <StatCard icon={MapPin} label="Stops planned" value={plan.total_stops_planned ?? 0} />
            <StatCard icon={Gauge} label="Distance" value={`${plan.total_distance_km ?? 0} km`} />
            <StatCard
              icon={Clock}
              label="Drive time"
              value={`${plan.total_duration_min ?? 0} min`}
            />
          </div>

          {typeof plan.confidence === "number" && (
            <div className="flex items-center gap-2 text-[13px] text-[#86868b]">
              <CheckCircle2 size={15} className="text-[#34c759]" />
              Plan confidence: {Math.round(plan.confidence * 100)}% · Solver {plan.solver_status || "—"}
            </div>
          )}

          {dispatchResult ? (
            <div className="bg-[#34c759]/[0.08] border border-[#34c759]/25 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-2.5">
                <CheckCircle2 size={18} className="text-[#34c759]" />
                <span className="text-[14px] font-semibold text-[#1d1d1f]">
                  {dispatchResult.jobs_created} job{dispatchResult.jobs_created !== 1 ? "s" : ""} saved and assigned to{" "}
                  {dispatchResult.drivers_assigned} driver{dispatchResult.drivers_assigned !== 1 ? "s" : ""}
                </span>
              </div>
              <ul className="text-[12px] text-[#86868b] space-y-1 mb-3">
                {dispatchResult.assignments?.map((a) => (
                  <li key={a.job_id}>
                    <span className="font-medium text-[#1d1d1f]">{a.area}</span> → {a.driver_name} · {a.stops} stops
                  </li>
                ))}
              </ul>
              <Link
                to="/jobs"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#008080] hover:underline"
              >
                View jobs <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-2xl border border-black/[0.06] px-5 py-4">
              <p className="text-[13px] text-[#86868b]">
                Happy with this plan? Assign it to your drivers and save it as jobs.
              </p>
              <button
                onClick={assignAndSave}
                disabled={dispatching}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#008080] text-white text-[13px] font-medium disabled:opacity-40 active:scale-[0.98] transition-transform whitespace-nowrap"
              >
                {dispatching ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Assigning…
                  </>
                ) : (
                  <>
                    <UserCheck size={16} />
                    Assign drivers & save jobs
                  </>
                )}
              </button>
            </div>
          )}

          {plan.routes?.map((route) => (
            <div
              key={route.route_number}
              className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-black/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#008080]/10 flex items-center justify-center">
                    <RouteIcon size={15} className="text-[#008080]" />
                  </div>
                  <span className="text-[14px] font-semibold text-[#1d1d1f]">
                    Route {route.route_number}
                  </span>
                </div>
                <span className="text-[12px] text-[#86868b]">
                  {route.stops.length} stops · {route.distance_km} km · {route.duration_min} min
                </span>
              </div>
              <div className="divide-y divide-black/[0.04]">
                {route.stops.map((stop) => (
                  <div key={`${stop.order_id}-${stop.sequence}`} className="px-5 py-3 flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#f0f0f0] text-[#1d1d1f] text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                      {stop.sequence}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[#1d1d1f] truncate">
                        {stop.customer_name || "Customer"}
                      </p>
                      <p className="text-[12px] text-[#86868b] truncate">{stop.address || "—"}</p>
                    </div>
                    {stop.eta && (
                      <span className="text-[12px] text-[#86868b] flex-shrink-0">
                        {formatEta(stop.eta)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {plan.unassigned?.length > 0 && (
            <div className="bg-[#ff9500]/[0.06] border border-[#ff9500]/20 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-[#ff9500]" />
                <span className="text-[13px] font-semibold text-[#1d1d1f]">
                  {plan.unassigned.length} stop{plan.unassigned.length > 1 ? "s" : ""} could not be assigned
                </span>
              </div>
              <ul className="text-[12px] text-[#86868b] space-y-1 pl-6 list-disc">
                {plan.unassigned.map((u, i) => (
                  <li key={i}>
                    {u.customer_name || "Customer"} — {u.address || "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
