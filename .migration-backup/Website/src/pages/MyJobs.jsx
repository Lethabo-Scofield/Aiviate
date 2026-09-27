import { useState, useEffect } from "react";
import { Package, MapPin, CheckCircle2, Circle, Clock, Navigation, Truck, Phone, FileText } from "lucide-react";
import { Spinner, SkeletonList } from "../components/Loader";
import { getMyJobs, completeMyStop } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

export default function MyJobs() {
  const { user } = useAuth();
  const [data, setData] = useState({ driver: null, jobs: [] });
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(null);
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

  const handleComplete = async (jobId, stopId) => {
    setCompleting(stopId);
    try {
      await completeMyStop(jobId, stopId);
      await load();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setCompleting(null);
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
          <div className="w-10 h-10 rounded-xl bg-[#111315]/10 flex items-center justify-center">
            <Truck size={18} className="text-[#111315]" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold text-[#111315] tracking-tight">My Deliveries</h1>
            <p className="text-[13px] text-[#868E96]">
              {user?.name || "Driver"} &middot; {activeJobs.length} active job{activeJobs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="apple-card p-10 text-center">
          <p className="text-[14px] text-[#343A40] mb-4">{error}</p>
          <button onClick={() => { setLoading(true); load(); }} className="apple-btn apple-btn-primary">Retry</button>
        </div>
      ) : data.jobs.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-[#c7c7cc]" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-[#111315] mb-1">No jobs assigned yet</p>
          <p className="text-[13px] text-[#868E96]">Your admin will assign delivery jobs to you. Check back soon.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeJobs.map((job) => {
            const completed = job.stops.filter(s => s.completed).length;
            const total = job.stops.length;
            const progress = total > 0 ? (completed / total) * 100 : 0;
            const isExpanded = expandedJob === job.id;

            return (
              <div key={job.id} className="apple-card overflow-hidden">
                <button
                  onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#F1F3F5] flex items-center justify-center shrink-0">
                    <Navigation size={16} className="text-[#868E96]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#111315] truncate">{job.area}</p>
                    <p className="text-[12px] text-[#868E96]">
                      {completed}/{total} stops &middot; {job.total_distance_km.toFixed(1)} km
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative">
                    <svg className="w-10 h-10 -rotate-90">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#F1F3F5" strokeWidth="3" />
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#111315" strokeWidth="3"
                        strokeDasharray={`${progress * 1.005} 100.5`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="absolute text-[10px] font-bold text-[#111315]">{Math.round(progress)}%</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#F1F3F5] px-4 pb-4">
                    <div className="space-y-1 pt-3">
                      {job.stops
                        .sort((a, b) => a.stop_number - b.stop_number)
                        .map((stop, i) => (
                        <div
                          key={stop.id}
                          className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${stop.completed ? "bg-[#F1F3F5] opacity-50" : "bg-white"}`}
                        >
                          <div className="flex flex-col items-center shrink-0 pt-0.5">
                            <span className="w-6 h-6 rounded-full bg-[#111315]/10 flex items-center justify-center text-[10px] font-bold text-[#111315]">
                              {i + 1}
                            </span>
                            {i < job.stops.length - 1 && (
                              <div className="w-px h-8 bg-[#e5e5ea] mt-1" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium ${stop.completed ? "text-[#ADB5BD] line-through" : "text-[#111315]"}`}>
                              {stop.customer_name || "Customer"}
                            </p>
                            <p className="text-[11px] text-[#868E96] leading-relaxed mt-0.5">{stop.address}</p>
                            <div className="flex flex-wrap gap-3 mt-1.5">
                              {stop.phone && (
                                <a href={`tel:${stop.phone}`} className="flex items-center gap-1 text-[11px] text-[#111315] font-medium">
                                  <Phone size={10} /> {stop.phone}
                                </a>
                              )}
                              {stop.notes && (
                                <span className="flex items-center gap-1 text-[11px] text-[#868E96]">
                                  <FileText size={10} /> {stop.notes}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {stop.completed ? (
                              <div className="w-8 h-8 rounded-full bg-[#5C636A]/10 flex items-center justify-center">
                                <CheckCircle2 size={16} className="text-[#5C636A]" />
                              </div>
                            ) : (
                              <button
                                onClick={() => handleComplete(job.id, stop.id)}
                                disabled={completing === stop.id}
                                className="w-8 h-8 rounded-full bg-[#111315] flex items-center justify-center hover:bg-[#343a40] transition-colors disabled:opacity-50"
                              >
                                {completing === stop.id ? (
                                  <Spinner size={12} />
                                ) : (
                                  <CheckCircle2 size={16} className="text-white" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {completedJobs.length > 0 && (
            <div className="pt-4">
              <p className="text-[12px] font-semibold text-[#868E96] uppercase tracking-wider mb-2 px-1">Completed</p>
              {completedJobs.map((job) => (
                <div key={job.id} className="apple-card p-4 flex items-center gap-3 opacity-50 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-[#5C636A]/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} className="text-[#5C636A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#111315]">{job.area}</p>
                    <p className="text-[11px] text-[#868E96]">{job.total_stops} stops &middot; {job.total_distance_km.toFixed(1)} km</p>
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
