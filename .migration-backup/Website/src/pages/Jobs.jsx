import { useState, useEffect } from "react";
import { Package, UserPlus, ChevronDown, ChevronUp, X, Link2, Check } from "lucide-react";
import { SkeletonList } from "../components/Loader";
import { getJobs, getDrivers, assignDriver, unassignDriver, createTrackingLink } from "../services/api";
import { useNavigate } from "react-router-dom";

function fmtMoney(n) {
  return `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Jobs({ embedded = false }) {
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [expandedJob, setExpandedJob] = useState(null);
  const [assigningJob, setAssigningJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [j, d] = await Promise.all([getJobs(), getDrivers()]);
      setJobs(j.jobs || []);
      setDrivers(d.drivers || []);
      setError("");
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
      {!embedded && (
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Jobs</h1>
            <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">
              {jobs.length} jobs | {unassigned.length} need drivers
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#343A40] mb-4">{error}</p>
          <button onClick={() => { setLoading(true); loadData(); }} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-[#c7c7cc]" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] text-[#868E96] mb-4">No jobs yet</p>
          <button onClick={() => navigate("/jobs?tab=dispatch")} className="apple-btn apple-btn-primary text-[13px]">
            Upload deliveries
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {unassigned.length > 0 && (
            <div>
              <h2 className="text-[12px] font-semibold text-[#868E96] uppercase tracking-wider mb-3">
                Needs Driver ({unassigned.length})
              </h2>
              <div className="space-y-2">
                {unassigned.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    drivers={drivers}
                    expanded={expandedJob === job.id}
                    assigning={assigningJob === job.id}
                    onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    onAssignToggle={() => setAssigningJob(assigningJob === job.id ? null : job.id)}
                    onAssign={(d) => handleAssign(job.id, d)}
                    onUnassign={() => handleUnassign(job.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {assigned.length > 0 && (
            <div>
              <h2 className="text-[12px] font-semibold text-[#868E96] uppercase tracking-wider mb-3">
                Assigned ({assigned.length})
              </h2>
              <div className="space-y-2">
                {assigned.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    drivers={drivers}
                    expanded={expandedJob === job.id}
                    assigning={assigningJob === job.id}
                    onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    onAssignToggle={() => setAssigningJob(assigningJob === job.id ? null : job.id)}
                    onAssign={(d) => handleAssign(job.id, d)}
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

function JobRow({ job, drivers, expanded, assigning, onToggle, onAssignToggle, onAssign, onUnassign }) {
  const [trackingState, setTrackingState] = useState({});

  const handleTrackingLink = async (stopId) => {
    setTrackingState((prev) => ({ ...prev, [stopId]: { loading: true } }));
    try {
      const res = await createTrackingLink(stopId);
      const link = res.tracking_link;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      }
      setTrackingState((prev) => ({ ...prev, [stopId]: { copied: true, link } }));
    } catch (e) {
      setTrackingState((prev) => ({ ...prev, [stopId]: { error: e.message || "Could not create link" } }));
    }
  };

  return (
    <div className="apple-card overflow-hidden">
      <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-[#fafafa] transition-colors" onClick={onToggle}>
        <div className="w-10 h-10 rounded-xl bg-[#F1F3F5] flex items-center justify-center shrink-0">
          <Package size={17} className="text-[#868E96]" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#111315]">{job.area}</p>
          <p className="text-[12px] text-[#ADB5BD]">{job.total_stops} stops | {job.total_distance_km} km | {fmtMoney(job.display_total)}</p>
        </div>
        <div className="flex items-center gap-3">
          {job.driver_name ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#5C636A] font-medium hidden sm:inline">{job.driver_name}</span>
              <button onClick={(e) => { e.stopPropagation(); onUnassign(); }}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#343A40]/10 transition-colors">
                <X size={12} className="text-[#c7c7cc] hover:text-[#343A40]" />
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

      {assigning && (
        <div className="px-4 pb-3 pt-3 bg-[#fafafa] border-t border-[#F1F3F5] animate-fade-in">
          <p className="text-[12px] font-medium text-[#868E96] mb-2">Select a driver</p>
          {drivers.length === 0 ? (
            <p className="text-[12px] text-[#ADB5BD]">No drivers yet. Add some first.</p>
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

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-[#F1F3F5] animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { v: job.total_stops, l: "Stops" },
              { v: `${job.total_distance_km} km`, l: "Distance" },
              { v: fmtMoney(job.display_total), l: "Orders" },
              { v: `${job.estimated_time_min} min`, l: "Est. Time" },
            ].map(({ v, l }) => (
              <div key={l} className="bg-[#F1F3F5] rounded-xl p-2.5 text-center">
                <p className="text-[14px] font-semibold text-[#111315]">{v}</p>
                <p className="text-[10px] text-[#ADB5BD]">{l}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] font-semibold text-[#868E96] uppercase tracking-wider mb-2">Stop sequence</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {job.stops.map((stop, idx) => {
              const tracking = trackingState[stop.id] || {};
              return (
              <div key={stop.id} className={`flex items-center gap-2.5 p-2 rounded-lg text-[12px] ${stop.completed ? "bg-[#5C636A]/5" : "bg-[#F1F3F5]"}`}>
                <span className="font-bold text-[#c7c7cc] w-4 text-right shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[#111315]">{stop.customer_name}</span>
                  <span className="text-[#ADB5BD] ml-1.5 truncate hidden sm:inline">{stop.address} · {fmtMoney(stop.display_total)}</span>
                  {tracking.link && (
                    <p className="text-[10.5px] text-[#111315] truncate mt-0.5">{tracking.link}</p>
                  )}
                  {tracking.error && (
                    <p className="text-[10.5px] text-[#343A40] mt-0.5">{tracking.error}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleTrackingLink(stop.id); }}
                  disabled={tracking.loading}
                  className="w-7 h-7 rounded-lg bg-white hover:bg-[#111315]/10 flex items-center justify-center transition-colors disabled:opacity-50"
                  title="Generate customer tracking link"
                >
                  {tracking.copied ? <Check size={13} className="text-[#5C636A]" /> : <Link2 size={13} className="text-[#111315]" />}
                </button>
                {stop.completed && <span className="text-[9px] px-1.5 py-0.5 bg-[#5C636A]/10 text-[#5C636A] rounded-full font-semibold">Done</span>}
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}
