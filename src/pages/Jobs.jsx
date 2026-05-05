import { useState, useEffect } from "react";
import { Package, UserPlus, ChevronDown, ChevronUp, X, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SkeletonList } from "../components/Loader";
import { getJobs, getDrivers, assignDriver, unassignDriver, reassignDriver, getJobProgress } from "../services/api";
import { useNavigate } from "react-router-dom";

function timingBadge(timing) {
  if (timing === "delayed")
    return <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#ff9500]/10 text-[#ff9500] font-semibold"><AlertTriangle size={9} />Delayed</span>;
  return <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] font-semibold"><CheckCircle2 size={9} />On Time</span>;
}

function stopStatusDot(status) {
  const colors = {
    pending:   "bg-[#c7c7cc]",
    arrived:   "bg-[#007aff]",
    completed: "bg-[#34c759]",
    failed:    "bg-[#ff3b30]",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status] || colors.pending}`} />;
}

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [expandedJob, setExpandedJob] = useState(null);
  const [assigningJob, setAssigningJob] = useState(null);
  const [reassigningJob, setReassigningJob] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [j, d] = await Promise.all([getJobs(), getDrivers()]);
      const allJobs = j.jobs || [];
      setJobs(allJobs);
      setDrivers(d.drivers || []);
      setError("");
      // Load progress for active jobs
      const active = allJobs.filter(j => ["assigned", "in_progress"].includes(j.status));
      if (active.length > 0) {
        const results = await Promise.allSettled(active.map(j => getJobProgress(j.id)));
        const map = {};
        results.forEach((r, i) => { if (r.status === "fulfilled") map[active[i].id] = r.value; });
        setProgressMap(map);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAssign = async (jobId, driver) => {
    try {
      await assignDriver(jobId, driver.id);
      setAssigningJob(null);
      loadData();
    } catch (e) {
      alert("Failed to assign: " + e.message);
    }
  };

  const handleReassign = async (jobId, driver) => {
    try {
      await reassignDriver(jobId, driver.id);
      setReassigningJob(null);
      loadData();
    } catch (e) {
      alert("Failed to reassign: " + e.message);
    }
  };

  const handleUnassign = async (jobId) => {
    try {
      await unassignDriver(jobId);
      loadData();
    } catch (e) {
      alert("Failed to unassign: " + e.message);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton h-8 w-24 mb-2" />
        <div className="skeleton h-4 w-40 mb-8" />
        <SkeletonList count={4} />
      </div>
    );
  }

  const unassigned = jobs.filter(j => j.status === "unassigned");
  const assigned = jobs.filter(j => j.status !== "unassigned");

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">Jobs</h1>
          <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">
            {jobs.length} jobs | {unassigned.length} need drivers
          </p>
        </div>
      </div>

      {error ? (
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#ff3b30] mb-4">{error}</p>
          <button onClick={() => { setLoading(true); loadData(); }} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-[#c7c7cc]" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] text-[#86868b] mb-4">No jobs yet</p>
          <button onClick={() => navigate("/dispatch")} className="apple-btn apple-btn-primary text-[13px]">
            Upload deliveries
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {unassigned.length > 0 && (
            <div>
              <h2 className="text-[12px] font-semibold text-[#ff9500] uppercase tracking-wider mb-3">
                Needs Driver ({unassigned.length})
              </h2>
              <div className="space-y-2">
                {unassigned.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    drivers={drivers}
                    progress={progressMap[job.id]}
                    expanded={expandedJob === job.id}
                    assigning={assigningJob === job.id}
                    reassigning={reassigningJob === job.id}
                    onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    onAssignToggle={() => setAssigningJob(assigningJob === job.id ? null : job.id)}
                    onReassignToggle={() => setReassigningJob(reassigningJob === job.id ? null : job.id)}
                    onAssign={(d) => handleAssign(job.id, d)}
                    onReassign={(d) => handleReassign(job.id, d)}
                    onUnassign={() => handleUnassign(job.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {assigned.length > 0 && (
            <div>
              <h2 className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider mb-3">
                Assigned ({assigned.length})
              </h2>
              <div className="space-y-2">
                {assigned.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    drivers={drivers}
                    progress={progressMap[job.id]}
                    expanded={expandedJob === job.id}
                    assigning={assigningJob === job.id}
                    reassigning={reassigningJob === job.id}
                    onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    onAssignToggle={() => setAssigningJob(assigningJob === job.id ? null : job.id)}
                    onReassignToggle={() => setReassigningJob(reassigningJob === job.id ? null : job.id)}
                    onAssign={(d) => handleAssign(job.id, d)}
                    onReassign={(d) => handleReassign(job.id, d)}
                    onUnassign={() => handleUnassign(job.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({ job, drivers, progress, expanded, assigning, reassigning, onToggle, onAssignToggle, onReassignToggle, onAssign, onReassign, onUnassign }) {
  const pct = progress ? progress.progress_pct : 0;
  const timing = progress ? progress.timing_status : null;
  const isActive = ["assigned", "in_progress"].includes(job.status);
  const barColor = timing === "delayed" ? "bg-[#ff9500]" : "bg-[#34c759]";

  const statusChip = () => {
    const map = {
      assigned:    "bg-[#008080]/10 text-[#008080]",
      in_progress: "bg-[#007aff]/10 text-[#007aff]",
      completed:   "bg-[#34c759]/10 text-[#34c759]",
      unassigned:  "bg-[#ff9500]/10 text-[#ff9500]",
    };
    return (
      <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${map[job.status] || "bg-[#f5f5f7] text-[#86868b]"}`}>
        {job.status.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="apple-card overflow-hidden">
      <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-[#fafafa] transition-colors" onClick={onToggle}>
        <div className="w-10 h-10 rounded-xl bg-[#f5f5f7] flex items-center justify-center shrink-0">
          <Package size={17} className="text-[#86868b]" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[#1d1d1f]">{job.area}</p>
            {timing && timingBadge(timing)}
          </div>
          <p className="text-[12px] text-[#aeaeb2]">
            {job.total_stops} stops | {job.total_distance_km} km
            {progress && ` | ${progress.completed_stops}/${progress.total_stops} done`}
          </p>
          {/* Progress bar for active jobs */}
          {isActive && (
            <div className="mt-1.5 h-1 bg-[#f0f0f0] rounded-full overflow-hidden w-full max-w-[160px]">
              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusChip()}
          {job.driver_name ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-[#6e6e73] font-medium hidden sm:inline">{job.driver_name}</span>
              <button onClick={(e) => { e.stopPropagation(); onReassignToggle(); }}
                title="Reassign driver"
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#007aff]/10 transition-colors">
                <RefreshCw size={11} className="text-[#c7c7cc] hover:text-[#007aff]" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onUnassign(); }}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#ff3b30]/10 transition-colors">
                <X size={12} className="text-[#c7c7cc] hover:text-[#ff3b30]" />
              </button>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onAssignToggle(); }}
              className="apple-btn apple-btn-primary text-[12px] py-1.5 px-3">
              <UserPlus size={12} /> <span className="hidden sm:inline">Assign</span>
            </button>
          )}
          {expanded ? <ChevronUp size={15} className="text-[#c7c7cc]" /> : <ChevronDown size={15} className="text-[#c7c7cc]" />}
        </div>
      </div>

      {/* Assign panel */}
      {assigning && (
        <div className="px-4 pb-3 pt-3 bg-[#fafafa] border-t border-[#f0f0f0] animate-fade-in">
          <p className="text-[12px] font-medium text-[#86868b] mb-2">Select a driver</p>
          {drivers.length === 0 ? (
            <p className="text-[12px] text-[#aeaeb2]">No drivers yet. Add some first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {drivers.map((d) => (
                <button key={d.id} onClick={() => onAssign(d)}
                  className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3">
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reassign panel */}
      {reassigning && (
        <div className="px-4 pb-3 pt-3 bg-[#fff8f0] border-t border-[#ffe5b4] animate-fade-in">
          <p className="text-[12px] font-medium text-[#ff9500] mb-1">Reassign driver</p>
          <p className="text-[11px] text-[#86868b] mb-2">Remaining stops will be re-optimized from the new driver's current location.</p>
          {drivers.length === 0 ? (
            <p className="text-[12px] text-[#aeaeb2]">No drivers available.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {drivers.filter(d => d.id !== job.driver_id).map((d) => (
                <button key={d.id} onClick={() => onReassign(d)}
                  className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3">
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expanded stop list */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-[#f0f0f0] animate-fade-in">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { v: job.total_stops, l: "Stops" },
              { v: `${job.total_distance_km} km`, l: "Distance" },
              { v: `${job.estimated_time_min} min`, l: "Est. Time" },
            ].map(({ v, l }) => (
              <div key={l} className="bg-[#f5f5f7] rounded-xl p-2.5 text-center">
                <p className="text-[14px] font-semibold text-[#1d1d1f]">{v}</p>
                <p className="text-[10px] text-[#aeaeb2]">{l}</p>
              </div>
            ))}
          </div>

          {/* Progress summary */}
          {progress && (
            <div className="mb-3 p-3 bg-[#f5f5f7] rounded-xl">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-medium text-[#1d1d1f]">Progress</span>
                <span className="text-[#86868b]">{progress.completed_stops}/{progress.total_stops} stops</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex gap-3 mt-2 text-[11px] text-[#86868b]">
                <span className="text-[#34c759] font-medium">{progress.completed_stops} done</span>
                {progress.failed_stops > 0 && <span className="text-[#ff3b30] font-medium">{progress.failed_stops} failed</span>}
                {progress.arrived_stops > 0 && <span className="text-[#007aff] font-medium">{progress.arrived_stops} en route</span>}
                <span>{progress.pending_stops} pending</span>
              </div>
            </div>
          )}

          <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-2">Stop sequence</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {job.stops.map((stop, idx) => {
              const statusLabel = { pending: "", arrived: "En Route", completed: "Done", failed: "Failed" };
              const labelColors = { arrived: "bg-[#007aff]/10 text-[#007aff]", completed: "bg-[#34c759]/10 text-[#34c759]", failed: "bg-[#ff3b30]/10 text-[#ff3b30]" };
              const st = stop.status || (stop.completed ? "completed" : "pending");
              return (
                <div key={stop.id} className={`flex items-center gap-2.5 p-2 rounded-lg text-[12px] ${stop.completed ? "bg-[#34c759]/5" : st === "failed" ? "bg-[#ff3b30]/5" : "bg-[#f5f5f7]"}`}>
                  <span className="font-bold text-[#c7c7cc] w-4 text-right shrink-0">{idx + 1}</span>
                  {stopStatusDot(st)}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[#1d1d1f]">{stop.customer_name}</span>
                    <span className="text-[#aeaeb2] ml-1.5 truncate hidden sm:inline">{stop.address}</span>
                  </div>
                  {st !== "pending" && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${labelColors[st] || ""}`}>
                      {statusLabel[st]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
