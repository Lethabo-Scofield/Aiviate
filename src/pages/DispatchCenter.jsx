import { useState, useEffect } from "react";
import { Upload, Zap, CheckCircle, AlertTriangle, FileSpreadsheet, ArrowLeft, MapPin, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";
import { Spinner } from "../components/Loader";
import { uploadExcel, optimizeStops, getStops, getJobs, loadTestData } from "../services/api";
import { useNavigate } from "react-router-dom";

export default function DispatchCenter({ embedded = false }) {
  const [step, setStep] = useState("upload");
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [stops, setStops] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [clusterRadius, setClusterRadius] = useState(8);
  const [loadingTest, setLoadingTest] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [stopsRes, jobsRes] = await Promise.all([getStops(), getJobs()]);
        if (stopsRes.stops?.length > 0) {
          setStops(stopsRes.stops);
          if (jobsRes.jobs?.length > 0) {
            setJobs(jobsRes.jobs);
            setStep("results");
          } else {
            setStep("optimize");
          }
        }
      } catch (e) {
        console.error("Failed to load dispatch data:", e);
      }
    };
    load();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadExcel(file);
      setUploadResult(result);
      setStops(result.stops || []);
      setStep("optimize");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setError("");
    try {
      const result = await optimizeStops(stops, 4, clusterRadius);
      setJobs(result.jobs || []);
      setStep("results");
    } catch (err) {
      setError(err.message);
    } finally {
      setOptimizing(false);
    }
  };

  const handleTestMode = async () => {
    setLoadingTest(true);
    setError("");
    try {
      const result = await loadTestData();
      setUploadResult(result);
      setStops(result.stops || []);
      setStep("optimize");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTest(false);
    }
  };

  const handleReset = () => {
    if (stops.length > 0 || jobs.length > 0) {
      if (!window.confirm("This will clear all uploaded data and optimized routes. Continue?")) return;
    }
    setStep("upload");
    setStops([]);
    setJobs([]);
    setUploadResult(null);
    setError("");
  };

  const stepIndex = ["upload", "optimize", "results"].indexOf(step);

  return (
    <div className="animate-fade-in">
      {!embedded && (
        <div className="mb-6 sm:mb-8">
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Dispatch</h1>
          <p className="text-[13px] sm:text-[14px] text-[#868E96] mt-1">Upload delivery addresses and optimize routes</p>
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-3 mb-8 overflow-x-auto pb-1">
        {["Upload", "Optimize", "Done"].map((label, i) => (
          <div key={label} className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
                stepIndex > i ? "bg-[#008080] text-white" :
                stepIndex === i ? "bg-[#008080] text-white" :
                "bg-[#F1F3F5] text-[#c7c7cc]"
              }`}>
                {stepIndex > i ? "✓" : i + 1}
              </div>
              <span className={`text-[13px] font-medium ${stepIndex >= i ? "text-[#343A40]" : "text-[#c7c7cc]"}`}>
                {label}
              </span>
            </div>
            {i < 2 && <div className={`w-6 sm:w-10 h-px ${stepIndex > i ? "bg-[#008080]" : "bg-[#e5e5ea]"}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-5 apple-card p-4 flex items-center gap-3 border-l-4 border-l-[#ff3b30] animate-slide-up">
          <AlertTriangle size={18} className="text-[#ff3b30] shrink-0" />
          <p className="text-[13px] text-[#111315]">{error}</p>
        </div>
      )}

      {step === "upload" && (
        <div className="max-w-xl mx-auto sm:mx-0 animate-slide-up">
          <div className="apple-card p-8 sm:p-10">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#F1F3F5] flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet size={24} className="text-[#868E96]" strokeWidth={1.5} />
              </div>
              <h2 className="text-[17px] font-semibold text-[#111315] mb-1">Upload Delivery Addresses</h2>
              <p className="text-[13px] text-[#868E96]">Excel or CSV with a <span className="font-semibold text-[#111315]">Full_Address</span> column</p>
            </div>

            <div className="border-2 border-dashed border-[#e5e5ea] rounded-2xl p-8 text-center hover:border-[#c7c7cc] transition-all group cursor-pointer">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} disabled={uploading} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer block">
                {uploading ? (
                  <div>
                    <Spinner size={28} className="mx-auto mb-3" />
                    <p className="text-[14px] text-[#111315] font-medium">Geocoding addresses...</p>
                    <p className="text-[12px] text-[#ADB5BD] mt-1">~1 second per address</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="text-[#DEE2E6] mx-auto mb-3 group-hover:text-[#868E96] transition-colors" strokeWidth={1.5} />
                    <p className="text-[14px] text-[#111315] font-medium">Click to upload</p>
                    <p className="text-[12px] text-[#ADB5BD] mt-1">.xlsx, .xls, or .csv</p>
                  </div>
                )}
              </label>
            </div>

            <div className="mt-5 mb-1">
              <button
                onClick={() => setShowExample(!showExample)}
                className="flex items-center gap-1.5 text-[12px] text-[#868E96] font-medium hover:text-[#111315] transition-colors mx-auto"
              >
                <FileSpreadsheet size={13} />
                {showExample ? "Hide" : "View"} example data format
                {showExample ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {showExample && (
              <div className="mt-3 animate-fade-in">
                <div className="rounded-xl border border-[#e5e5ea] overflow-hidden">
                  <div className="bg-[#F1F3F5] px-3 py-2 border-b border-[#e5e5ea]">
                    <p className="text-[11px] font-semibold text-[#868E96] uppercase tracking-wider">Example Excel rows</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-[#fafafa] border-b border-[#F1F3F5]">
                          {["Full_Address", "Customer_Name", "Order_ID", "Phone", "Notes"].map((h) => (
                            <th key={h} className={`px-2.5 py-2 text-left font-semibold whitespace-nowrap ${h === "Full_Address" ? "text-[#111315]" : "text-[#868E96]"}`}>
                              {h}{h === "Full_Address" && <span className="text-[#ff3b30] ml-0.5">*</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-[#111315]">
                        {[
                          ["Vilakazi Street, Orlando West, Soweto", "Sipho Ndlovu", "ORD-001", "+27 72 100 0001", "Ring bell twice"],
                          ["Kotze Street, Hillbrow, Johannesburg", "James van der Merwe", "ORD-003", "+27 72 100 0003", ""],
                          ["Sandton City Mall, Sandton", "Pieter Botha", "ORD-005", "+27 72 100 0005", "Deliver to concierge"],
                          ["London Rd, Alexandra, Johannesburg", "Naledi Khumalo", "ORD-006", "+27 72 100 0006", ""],
                        ].map((row, i) => (
                          <tr key={i} className="border-b border-[#F1F3F5] last:border-0 hover:bg-[#fafafa]">
                            {row.map((cell, ci) => (
                              <td key={ci} className={`px-2.5 py-1.5 whitespace-nowrap ${ci === 0 ? "font-medium" : ""}`}>
                                {cell || <span className="text-[#DEE2E6]">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-[#F1F3F5] px-3 py-2 border-t border-[#e5e5ea]">
                    <p className="text-[10px] text-[#ADB5BD]">
                      <span className="text-[#ff3b30]">*</span> Required — all other columns are optional and auto-generated if missing
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-4">
              <div className="h-px flex-1 bg-[#e5e5ea]" />
              <span className="text-[11px] text-[#c7c7cc] font-medium">or</span>
              <div className="h-px flex-1 bg-[#e5e5ea]" />
            </div>

            <button
              onClick={handleTestMode}
              disabled={loadingTest || uploading}
              className="apple-btn apple-btn-secondary w-full mt-4 text-[13px]"
            >
              {loadingTest ? <><Spinner size={14} /> Loading test data...</> : <><FlaskConical size={14} /> Load test data (Johannesburg)</>}
            </button>
            <p className="text-[11px] text-[#ADB5BD] text-center mt-2">20 pre-geocoded delivery addresses across Soweto, Hillbrow, Sandton, Alexandra & more</p>
          </div>
        </div>
      )}

      {step === "optimize" && (
        <div className="max-w-2xl animate-slide-up">
          {uploadResult && (
            <div className="apple-card p-4 flex items-center gap-3 mb-5">
              <CheckCircle size={18} className="text-[#34c759] shrink-0" />
              <p className="text-[13px] text-[#111315]">
                <span className="font-semibold">{uploadResult.geocoded}</span> of {uploadResult.total_rows} addresses geocoded
                {uploadResult.failed > 0 && <span className="text-[#ff9500]"> | {uploadResult.failed} failed</span>}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div className="md:col-span-3 apple-card p-5">
              <h3 className="text-[13px] font-semibold text-[#111315] mb-3">{stops.length} addresses ready</h3>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {stops.map((stop, idx) => (
                  <div key={stop.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#F1F3F5] transition-colors">
                    <span className="text-[11px] font-bold text-[#c7c7cc] w-5 text-right shrink-0">{idx + 1}</span>
                    <MapPin size={12} className="text-[#DEE2E6] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#111315] truncate">{stop.customer_name}</p>
                      <p className="text-[11px] text-[#ADB5BD] truncate">{stop.address}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 apple-card p-5 flex flex-col">
              <h3 className="text-[13px] font-semibold text-[#111315] mb-4">Settings</h3>
              <div className="mb-4">
                <label className="text-[12px] text-[#868E96] font-medium mb-1.5 block">Cluster radius</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={clusterRadius}
                    onChange={(e) => setClusterRadius(parseInt(e.target.value) || 8)}
                    className="apple-input w-20 text-center"
                  />
                  <span className="text-[12px] text-[#ADB5BD]">km</span>
                </div>
                <p className="text-[11px] text-[#ADB5BD] mt-1.5">Nearby stops are grouped into one job</p>
              </div>

              <div className="flex-1" />

              <button
                onClick={handleOptimize}
                disabled={optimizing || stops.length < 2}
                className="apple-btn apple-btn-primary w-full"
              >
                {optimizing ? <><Spinner size={16} /> Optimizing...</> : <><Zap size={16} /> Optimize Routes</>}
              </button>
            </div>
          </div>

          <button onClick={handleReset} className="text-[12px] text-[#ADB5BD] hover:text-[#111315] transition-colors flex items-center gap-1">
            <ArrowLeft size={12} /> Start over
          </button>
        </div>
      )}

      {step === "results" && (
        <div className="animate-slide-up">
          <div className="apple-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-[#34c759] shrink-0" />
              <div>
                <p className="text-[14px] font-semibold text-[#111315]">{jobs.length} optimized jobs created</p>
                <p className="text-[12px] text-[#868E96]">{stops.length} stops grouped by area with optimized sequences</p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => navigate("/jobs?tab=jobs")} className="apple-btn apple-btn-primary text-[13px] py-2 px-4 flex-1 sm:flex-initial">
                Assign Drivers
              </button>
              <button onClick={handleReset} className="apple-btn apple-btn-secondary text-[13px] py-2 px-4 flex-1 sm:flex-initial">
                New Upload
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs.map((job, i) => (
              <div key={job.id} className="apple-card p-4 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1F3F5] text-[#868E96] font-semibold">{job.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    job.status === "assigned" ? "bg-[#008080]/10 text-[#008080]" :
                    "bg-[#ff9500]/10 text-[#ff9500]"
                  }`}>{job.status}</span>
                </div>
                <h3 className="text-[15px] font-semibold text-[#111315] mb-3">{job.area}</h3>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-[#F1F3F5] rounded-xl p-2.5">
                    <p className="text-[15px] font-semibold text-[#111315]">{job.total_stops}</p>
                    <p className="text-[10px] text-[#ADB5BD]">stops</p>
                  </div>
                  <div className="bg-[#F1F3F5] rounded-xl p-2.5">
                    <p className="text-[15px] font-semibold text-[#111315]">{job.total_distance_km} km</p>
                    <p className="text-[10px] text-[#ADB5BD]">distance</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
