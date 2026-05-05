import { useState, useEffect } from "react";
import { Package, CheckCircle2, Navigation, Truck, Phone, FileText, MapPin, XCircle, AlertTriangle } from "lucide-react";
import { Spinner, SkeletonList } from "../components/Loader";
import { getMyJobs, updateStopStatus } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

export default function MyJobs() {
  const { user } = useAuth();
  const [data, setData] = useState({ driver: null, jobs: [] });
  const [loading, setLoading] = useState(true);
  const [actionStop, setActionStop] = useState(null); // stopId being actioned
  const [failingStop, setFailingStop] = useState(null); // stopId showing fail reason input
  const [failReason, setFailReason] = useState("");
  const [expandedJob, setExpandedJob] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const result = await getMyJobs();
      const safeResult = { driver: result?.driver || null, jobs: Array.isArray(result?.jobs) ? result.jobs : [] };
      setData(safeResult);
      if (safeResult.jobs.length === 1) setExpandedJob(safeResult.jobs[0].id);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Could not load your jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStatusUpdate = async (stopId, status, reason = "") => {
    setActionStop(stopId);
    try {
      await updateStopStatus(stopId, status, reason);
      setFailingStop(null);
      setFailReason("");
      await load();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setActionStop(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="skeleton h-8 w-32 mb-2" />
        <div className="skeleton h-4 w-48 mb-8" />
        <SkeletonList count={3} />
      </div>
    );
  }

  const activeJobs = data.jobs.filter(j => j.status !== "completed");
  const completedJobs = data.jobs.filter(j => j.status === "completed");

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-[#008080]/10 flex items-center justify-center">
            <Truck size={18} className="text-[#008080]" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight">My Deliveries</h1>
            <p className="text-[13px] text-[#86868b]">
              {user?.name || "Driver"} &middot; {activeJobs.length} active job{activeJobs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#ff3b30] mb-4">{error}</p>
          <button onClick={() => { setLoading(true); load(); }} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      ) : data.jobs.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-[#c7c7cc]" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-[#1d1d1f] mb-1">No jobs assigned yet</p>
          <p className="text-[13px] text-[#86868b]">Your admin will assign delivery jobs to you. Check back soon.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeJobs.map((job) => {
            const completed = job.stops.filter(s => s.status === "completed").length;
            const total = job.stops.length;
            const progress = total > 0 ? (completed / total) * 100 : 0;
            const isExpanded = expandedJob === job.id;

            return (
              <div key={job.id} className="apple-card overflow-hidden">
                <button
                  onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#f5f5f7] flex items-center justify-center shrink-0">
                    <Navigation size={16} className="text-[#86868b]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#1d1d1f] truncate">{job.area}</p>
                    <p className="text-[12px] text-[#86868b]">
                      {completed}/{total} stops &middot; {job.total_distance_km.toFixed(1)} km
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative">
                    <svg className="w-10 h-10 -rotate-90">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#f0f0f0" strokeWidth="3" />
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#008080" strokeWidth="3"
                        strokeDasharray={`${progress * 1.005} 100.5`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="absolute text-[10px] font-bold text-[#008080]">{Math.round(progress)}%</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#f0f0f0] px-4 pb-4">
                    <div className="space-y-1 pt-3">
                      {job.stops
                        .sort((a, b) => a.stop_number - b.stop_number)
                        .map((stop, i) => {
                          const isDone = stop.status === "completed" || stop.status === "failed";
                          const isArrived = stop.status === "arrived";
                          const isFailed = stop.status === "failed";
                          const isBusy = actionStop === stop.id;

                          return (
                          <div
                            key={stop.id}
                            className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${isDone ? "bg-[#f5f5f7] opacity-60" : isArrived ? "bg-[#fff3e0]" : "bg-white"}`}
                          >
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <span className="w-6 h-6 rounded-full bg-[#008080]/10 flex items-center justify-center text-[10px] font-bold text-[#008080]">
                                {i + 1}
                              </span>
                              {i < job.stops.length - 1 && (
                                <div className="w-px h-8 bg-[#e5e5ea] mt-1" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[13px] font-medium ${isDone ? "text-[#aeaeb2] line-through" : "text-[#1d1d1f]"}`}>
                                {stop.customer_name || "Customer"}
                              </p>
                              <p className="text-[11px] text-[#86868b] leading-relaxed mt-0.5">{stop.address}</p>
                              <div className="flex flex-wrap gap-3 mt-1.5">
                                {stop.phone && (
                                  <a href={`tel:${stop.phone}`} className="flex items-center gap-1 text-[11px] text-[#008080] font-medium">
                                    <Phone size={10} /> {stop.phone}
                                  </a>
                                )}
                                {stop.notes && (
                                  <span className="flex items-center gap-1 text-[11px] text-[#86868b]">
                                    <FileText size={10} /> {stop.notes}
                                  </span>
                                )}
                              </div>
                              {isFailed && stop.failed_reason && (
                                <p className="text-[11px] text-[#ff3b30] mt-1">✗ {stop.failed_reason}</p>
                              )}
                              {/* Fail reason input */}
                              {failingStop === stop.id && (
                                <div className="mt-2 flex items-center gap-2">
                                  <input
                                    className="flex-1 text-[12px] border border-[#e5e5ea] rounded-lg px-2 py-1 outline-none focus:border-[#ff3b30]"
                                    placeholder="Reason for failure…"
                                    value={failReason}
                                    onChange={e => setFailReason(e.target.value)}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleStatusUpdate(stop.id, "failed", failReason)}
                                    disabled={isBusy}
                                    className="text-[11px] font-semibold text-white bg-[#ff3b30] px-2 py-1 rounded-lg disabled:opacity-50"
                                  >
                                    {isBusy ? <Spinner size={10} /> : "Confirm"}
                                  </button>
                                  <button
                                    onClick={() => { setFailingStop(null); setFailReason(""); }}
                                    className="text-[11px] text-[#86868b]"
                                  >Cancel</button>
                                </div>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              {stop.status === "completed" && (
                                <div className="w-8 h-8 rounded-full bg-[#34c759]/10 flex items-center justify-center">
                                  <CheckCircle2 size={16} className="text-[#34c759]" />
                                </div>
                              )}
                              {stop.status === "failed" && (
                                <div className="w-8 h-8 rounded-full bg-[#ff3b30]/10 flex items-center justify-center">
                                  <XCircle size={16} className="text-[#ff3b30]" />
                                </div>
                              )}
                              {stop.status === "pending" && (
                                <button
                                  onClick={() => handleStatusUpdate(stop.id, "arrived")}
                                  disabled={isBusy}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-white bg-[#ff9500] px-2.5 py-1.5 rounded-lg hover:bg-[#e08600] transition-colors disabled:opacity-50"
                                >
                                  {isBusy ? <Spinner size={10} /> : <><MapPin size={11} /> Arrived</>}
                                </button>
                              )}
                              {stop.status === "arrived" && failingStop !== stop.id && (
                                <>
                                  <button
                                    onClick={() => handleStatusUpdate(stop.id, "completed")}
                                    disabled={isBusy}
                                    className="flex items-center gap-1 text-[11px] font-semibold text-white bg-[#34c759] px-2.5 py-1.5 rounded-lg hover:bg-[#28a745] transition-colors disabled:opacity-50"
                                  >
                                    {isBusy ? <Spinner size={10} /> : <><CheckCircle2 size={11} /> Done</>}
                                  </button>
                                  <button
                                    onClick={() => { setFailingStop(stop.id); setFailReason(""); }}
                                    className="flex items-center gap-1 text-[11px] font-semibold text-[#ff3b30] border border-[#ff3b30]/30 bg-white px-2.5 py-1.5 rounded-lg hover:bg-[#ff3b30]/5 transition-colors"
                                  >
                                    <AlertTriangle size={11} /> Failed
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                        })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {completedJobs.length > 0 && (
            <div className="pt-4">
              <p className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider mb-2 px-1">Completed</p>
              {completedJobs.map((job) => (
                <div key={job.id} className="apple-card p-4 flex items-center gap-3 opacity-50 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-[#34c759]/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} className="text-[#34c759]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1d1d1f]">{job.area}</p>
                    <p className="text-[11px] text-[#86868b]">{job.total_stops} stops &middot; {job.total_distance_km.toFixed(1)} km</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
