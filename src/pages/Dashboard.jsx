import { useState, useEffect, useCallback, useRef } from "react";
import { Package, Truck, MapPin, ArrowRight, Upload, Clock, CheckCircle2, AlertTriangle, Zap, Activity, Navigation } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getStats, getJobs, getDrivers, getJobProgress, loadDemo } from "../services/api";

const POLL_INTERVAL_MS = 2000;

function timingBadge(timing) {
  if (timing === "delayed")
    return <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#ff9500]/10 text-[#ff9500] font-semibold"><AlertTriangle size={9} />Delayed</span>;
  return <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] font-semibold"><CheckCircle2 size={9} />On Time</span>;
}

function statusChip(status) {
  const map = {
    assigned:    "bg-[#008080]/10 text-[#008080]",
    in_progress: "bg-[#007aff]/10 text-[#007aff]",
    completed:   "bg-[#34c759]/10 text-[#34c759]",
    unassigned:  "bg-[#ff9500]/10 text-[#ff9500]",
  };
  const labels = {
    assigned:    "Route Accepted",
    in_progress: "Trip in Progress",
    completed:   "Completed",
    unassigned:  "Unassigned",
  };
  return (
    <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${map[status] || "bg-[#f5f5f7] text-[#86868b]"}`}>
      {labels[status] || status.replace("_", " ")}
    </span>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const [activityFeed, setActivityFeed] = useState([]);
  const prevJobsRef = useRef({}); // map of jobId -> status from last poll
  const navigate = useNavigate();

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await loadDemo();
      alert(res.message || "Demo route created!");
      load();
    } catch (e) {
      alert("Demo failed: " + e.message);
    } finally {
      setDemoLoading(false);
    }
  };

  const loadProgress = useCallback(async (activeJobs) => {
    const results = await Promise.allSettled(
      activeJobs.map((j) => getJobProgress(j.id))
    );
    const map = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") map[activeJobs[i].id] = r.value;
    });
    setProgressMap(map);
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, j, d] = await Promise.all([getStats(), getJobs(), getDrivers()]);
      setStats(s);
      const allJobs = j.jobs || [];
      setJobs(allJobs);
      setDrivers(d.drivers || []);
      setError("");

      // ── Detect status transitions and push to activity feed ──────────────
      const prev = prevJobsRef.current;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const newEvents = [];
      allJobs.forEach((job) => {
        const oldStatus = prev[job.id];
        if (!oldStatus) return; // first load — don't emit
        if (oldStatus === job.status) return; // no change
        const driver = job.driver_name || "Driver";
        const route = job.area || job.id;
        if (oldStatus === "unassigned" && job.status === "assigned") {
          newEvents.push({ id: `${job.id}-${now.getTime()}`, time: timeStr, type: "accepted", text: `${driver} accepted route — ${route}`, jobId: job.id });
        } else if (job.status === "in_progress") {
          newEvents.push({ id: `${job.id}-${now.getTime()}`, time: timeStr, type: "started", text: `${driver} started trip — ${route}`, jobId: job.id });
        } else if (job.status === "completed") {
          newEvents.push({ id: `${job.id}-${now.getTime()}`, time: timeStr, type: "completed", text: `${driver} completed route — ${route}`, jobId: job.id });
        }
      });
      if (newEvents.length > 0) {
        setActivityFeed((prev) => [...newEvents, ...prev].slice(0, 20));
      }
      // Update prev snapshot
      const snapshot = {};
      allJobs.forEach((job) => { snapshot[job.id] = job.status; });
      prevJobsRef.current = snapshot;
      // ─────────────────────────────────────────────────────────────────────

      const activeJobs = allJobs.filter((j) => ["assigned", "in_progress"].includes(j.status));
      if (activeJobs.length > 0) loadProgress(activeJobs);
    } catch (e) {
      console.error(e);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loadProgress]);

  useEffect(() => {
    load();
    let interval = setInterval(load, POLL_INTERVAL_MS);
    // Pause polling while tab is hidden, resume immediately when tab becomes visible.
    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        load();
        interval = setInterval(load, POLL_INTERVAL_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="apple-card p-6"><div className="skeleton h-4 w-20 mb-3" /><div className="skeleton h-8 w-16" /></div>)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Dashboard</h1>
        </div>
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#ff3b30] mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  const hasData = stats && (stats.total_jobs || 0) > 0;
  const activeJobs = jobs.filter((j) => ["assigned", "in_progress"].includes(j.status));
  const completedStopsTotal = Object.values(progressMap).reduce((a, p) => a + (p.completed_stops || 0), 0);
  const totalStopsActive = Object.values(progressMap).reduce((a, p) => a + (p.total_stops || 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Dashboard</h1>
        <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">Overview of your dispatch operations</p>
      </div>

      {!hasData ? (
        <div className="space-y-5">
          <div className="apple-card p-10 sm:p-14 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mx-auto mb-5">
              <Package size={28} className="text-[#86868b]" strokeWidth={1.5} />
            </div>
            <h2 className="text-[20px] font-semibold text-[#1d1d1f] mb-2 tracking-tight">Get started</h2>
            <p className="text-[14px] text-[#86868b] mb-8 max-w-sm mx-auto leading-relaxed">
              Upload a spreadsheet of delivery addresses and the system will optimize your routes automatically.
            </p>
            <button onClick={() => navigate("/dispatch")} className="apple-btn apple-btn-primary">
              Upload Deliveries <ArrowRight size={16} />
            </button>
            <button onClick={handleDemo} disabled={demoLoading} className="apple-btn apple-btn-secondary mt-3">
              <Zap size={16} /> {demoLoading ? "Creating…" : "Quick demo — auto-create route"}
            </button>
          </div>

          <div className="apple-card p-6">
            <h3 className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider mb-5">Three steps to optimized routes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
              {[
                { step: "1", title: "Upload", desc: "Upload an Excel or CSV file with delivery addresses" },
                { step: "2", title: "Optimize", desc: "System geocodes addresses, clusters stops, and finds the best routes" },
                { step: "3", title: "Dispatch", desc: "Assign optimized jobs to your drivers" },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#008080] text-white flex items-center justify-center text-[12px] font-bold shrink-0">{step}</div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#1d1d1f] mb-1">{title}</p>
                    <p className="text-[12px] text-[#aeaeb2] leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "Jobs", value: stats.total_jobs || 0, sub: `${stats.unassigned || 0} unassigned`, icon: Package, accent: (stats.unassigned || 0) > 0 },
              { label: "Stops", value: stats.total_stops || 0, sub: `${stats.total_distance_km || 0} km total`, icon: MapPin },
              { label: "Drivers", value: stats.total_drivers || 0, sub: `${stats.assigned || 0} assigned`, icon: Truck },
            ].map(({ label, value, sub, icon: Icon, accent }) => (
              <div key={label} className="stat-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[12px] text-[#86868b] font-medium uppercase tracking-wide mb-2">{label}</p>
                    <p className="text-[32px] font-semibold text-[#1d1d1f] tracking-tight leading-none">{value}</p>
                    <p className={`text-[12px] mt-2 ${accent ? "text-[#ff9500] font-medium" : "text-[#aeaeb2]"}`}>{sub}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                    <Icon size={18} className="text-[#86868b]" strokeWidth={1.8} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Live progress summary */}
          {activeJobs.length > 0 && (
            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Live Progress</h2>
                  <p className="text-[12px] text-[#86868b] mt-0.5">
                    {completedStopsTotal} / {totalStopsActive} stops completed across {activeJobs.length} active {activeJobs.length === 1 ? "job" : "jobs"}
                  </p>
                </div>
                <Clock size={16} className="text-[#86868b]" />
              </div>

              {/* Overall progress bar */}
              {totalStopsActive > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-[11px] text-[#86868b] mb-1">
                    <span>Overall</span>
                    <span>{Math.round(completedStopsTotal / totalStopsActive * 100)}%</span>
                  </div>
                  <div className="h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#008080] transition-all duration-500"
                      style={{ width: `${(completedStopsTotal / totalStopsActive) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Per-job progress */}
              <div className="space-y-3">
                {activeJobs.map((job) => {
                  const p = progressMap[job.id];
                  const pct = p ? p.progress_pct : 0;
                  const timing = p ? p.timing_status : "on_time";
                  const barColor = timing === "delayed" ? "bg-[#ff9500]" : "bg-[#34c759]";
                  return (
                    <div key={job.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#1d1d1f]">{job.area}</span>
                          {p && timingBadge(timing)}
                        </div>
                        <span className="text-[11px] text-[#86868b]">
                          {p ? `${p.completed_stops}/${p.total_stops}` : `0/${job.total_stops}`} stops
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {p && (
                        <div className="flex items-center gap-3 mt-1">
                          {p.driver_name && <p className="text-[11px] text-[#aeaeb2]">{p.driver_name}</p>}
                          {p.arrived_stops > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#008080]/10 text-[#008080] font-semibold">
                              {p.arrived_stops} arrived
                            </span>
                          )}
                          {p.failed_stops > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ff3b30]/10 text-[#ff3b30] font-semibold">
                              {p.failed_stops} failed
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Activity Feed */}
          {activityFeed.length > 0 && (
            <div className="apple-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#007aff] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#007aff]"></span>
                </span>
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Live Activity</h2>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activityFeed.map((event) => {
                  const colors = {
                    accepted:  { bg: "bg-[#008080]/8",  dot: "bg-[#008080]",  text: "text-[#008080]"  },
                    started:   { bg: "bg-[#007aff]/8",  dot: "bg-[#007aff]",  text: "text-[#007aff]"  },
                    completed: { bg: "bg-[#34c759]/8",  dot: "bg-[#34c759]",  text: "text-[#34c759]"  },
                  };
                  const c = colors[event.type] || { bg: "bg-[#f5f5f7]", dot: "bg-[#aeaeb2]", text: "text-[#86868b]" };
                  return (
                    <div key={event.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${c.bg} animate-fade-in`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                      <span className={`text-[12px] font-medium flex-1 ${c.text}`}>{event.text}</span>
                      <span className="text-[10px] text-[#aeaeb2] shrink-0">{event.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Recent Jobs</h2>
                <button onClick={() => navigate("/jobs")} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f] transition-colors font-medium">
                  View all
                </button>
              </div>
              <div className="space-y-1">
                {jobs.slice(0, 5).map((job) => {
                  const p = progressMap[job.id];
                  const timing = p ? p.timing_status : null;
                  return (
                    <div key={job.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f5f5f7] transition-colors">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="text-[13px] font-medium text-[#1d1d1f]">{job.area}</p>
                        <p className="text-[11px] text-[#aeaeb2]">
                          {job.total_stops} stops | {job.total_distance_km} km
                          {p && ` | ${p.completed_stops}/${p.total_stops} done`}
                          {p && p.arrived_stops > 0 && ` | ${p.arrived_stops} arrived`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {timing && timingBadge(timing)}
                        {statusChip(job.status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="apple-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-semibold text-[#1d1d1f]">Drivers</h2>
                <button onClick={() => navigate("/drivers")} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f] transition-colors font-medium">
                  Manage
                </button>
              </div>
              {drivers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[13px] text-[#aeaeb2] mb-3">No drivers added yet</p>
                  <button onClick={() => navigate("/drivers")} className="text-[13px] text-[#1d1d1f] font-semibold hover:underline">
                    Add drivers
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {drivers.map((d) => {
                    const driverJobs = jobs.filter(j => j.driver_id === d.id);
                    const activeCount = driverJobs.filter(j => ["assigned", "in_progress"].includes(j.status)).length;
                    const driverProgress = driverJobs
                      .filter(j => progressMap[j.id])
                      .map(j => progressMap[j.id]);
                    const anyDelayed = driverProgress.some(p => p.timing_status === "delayed");
                    return (
                      <div key={d.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f5f5f7] transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2 h-2 rounded-full ${anyDelayed ? "bg-[#ff9500]" : "bg-[#34c759]"}`} />
                          <p className="text-[13px] font-medium text-[#1d1d1f]">{d.name}</p>
                        </div>
                        <p className="text-[11px] text-[#aeaeb2]">{activeCount} active</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <button onClick={() => navigate("/dispatch")} className="apple-btn apple-btn-secondary text-[13px]">
            <Upload size={14} /> Upload new deliveries
          </button>
          <button onClick={handleDemo} disabled={demoLoading} className="apple-btn apple-btn-secondary text-[13px]">
            <Zap size={14} /> {demoLoading ? "Creating…" : "Load demo route"}
          </button>
        </div>
      )}
    </div>
  );
}
