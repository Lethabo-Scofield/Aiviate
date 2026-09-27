import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, Package, RefreshCw, Truck } from "lucide-react";
import { Spinner } from "../components/Loader";
import { confirmPublicAvailability, getPublicTracking, requestPublicReschedule } from "../services/api";

function formatWindow(window) {
  if (!window?.start || !window?.end) return "Not available yet";
  try {
    return `${new Date(window.start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} - ${new Date(window.end).toLocaleTimeString([], { timeStyle: "short" })}`;
  } catch {
    return `${window.start} - ${window.end}`;
  }
}

export default function PublicTracking() {
  const { token } = useParams();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [windowDraft, setWindowDraft] = useState({ start: "", end: "" });

  const load = async () => {
    setLoading(true);
    try {
      setTracking(await getPublicTracking(token));
      setError("");
    } catch {
      setError("This tracking link is invalid, expired, or unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const submitAvailability = async (available) => {
    setSaving(true);
    setMessage("");
    try {
      await confirmPublicAvailability(token, available);
      setMessage(available ? "Availability confirmed." : "Thanks, dispatch has been notified.");
    } catch (e) {
      setMessage(e.message || "Could not save your response.");
    } finally {
      setSaving(false);
    }
  };

  const submitReschedule = async () => {
    if (!windowDraft.start || !windowDraft.end) {
      setMessage("Choose a start and end time.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const next = await requestPublicReschedule(token, windowDraft);
      setTracking(next);
      setMessage("New delivery window requested.");
    } catch (e) {
      setMessage(e.message || "Could not request that window.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F6F7F8] flex items-center justify-center px-4">
        <div className="apple-card max-w-md w-full p-8 text-center">
          <Package className="mx-auto text-[#ADB5BD] mb-4" size={32} />
          <h1 className="text-[20px] font-semibold text-[#111315]">Tracking unavailable</h1>
          <p className="text-[13px] text-[#868E96] mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const order = tracking.order || {};
  const delivery = tracking.delivery || {};

  return (
    <div className="min-h-screen bg-[#F6F7F8] px-4 py-8">
      <main className="max-w-xl mx-auto">
        <div className="mb-6">
          <p className="text-[12px] uppercase tracking-wider text-[#868E96] font-semibold">
            {tracking.branding?.company_name || "Aiviate"}
          </p>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#111315] mt-1">Delivery tracking</h1>
        </div>

        <section className="apple-card p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#111315]/10 flex items-center justify-center">
              <Truck size={22} className="text-[#111315]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-[#868E96]">Order reference</p>
              <p className="text-[16px] font-semibold text-[#111315] break-all">{order.reference}</p>
              <span className="inline-flex mt-3 px-2.5 py-1 rounded-full bg-[#111315]/10 text-[#111315] text-[12px] font-semibold">
                {order.status_label}
              </span>
            </div>
          </div>
        </section>

        <section className="apple-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-[#868E96]" />
            <h2 className="text-[14px] font-semibold text-[#111315]">Arrival window</h2>
          </div>
          <p className="text-[15px] text-[#111315]">{formatWindow(delivery.estimated_arrival || order.delivery_window)}</p>
          <p className="text-[12px] text-[#868E96] mt-1">
            {delivery.estimated_arrival?.confidence === "fallback_no_live_traffic"
              ? "Planned estimate. Live traffic is not configured."
              : "Updated when dispatch receives route progress."}
          </p>
        </section>

        <section className="apple-card p-5 mb-4">
          <h2 className="text-[14px] font-semibold text-[#111315] mb-3">Status timeline</h2>
          <div className="space-y-3">
            {(delivery.timeline || []).map((item) => (
              <div key={item.status} className="flex gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.completed ? "bg-[#5C636A]/10" : "bg-[#F1F3F5]"}`}>
                  {item.completed ? <CheckCircle2 size={14} className="text-[#5C636A]" /> : <Clock size={13} className="text-[#ADB5BD]" />}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#111315]">{item.label}</p>
                  {item.timestamp && <p className="text-[11px] text-[#868E96]">{new Date(item.timestamp).toLocaleString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {delivery.proof_summary && (
          <section className="apple-card p-5 mb-4">
            <h2 className="text-[14px] font-semibold text-[#111315] mb-2">Proof summary</h2>
            <p className="text-[13px] text-[#5C636A]">
              Delivered at {new Date(delivery.proof_summary.completed_at).toLocaleString()} with package and location verification.
            </p>
          </section>
        )}

        {delivery.reschedule_allowed && (
          <section className="apple-card p-5">
            <h2 className="text-[14px] font-semibold text-[#111315] mb-3">Need to change the time?</h2>
            <div className="grid sm:grid-cols-2 gap-2 mb-3">
              <input type="datetime-local" className="apple-input" value={windowDraft.start} onChange={(e) => setWindowDraft((p) => ({ ...p, start: e.target.value }))} />
              <input type="datetime-local" className="apple-input" value={windowDraft.end} onChange={(e) => setWindowDraft((p) => ({ ...p, end: e.target.value }))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={submitReschedule} className="apple-btn apple-btn-primary text-[13px]">
                <RefreshCw size={13} /> Request new window
              </button>
              <button disabled={saving} onClick={() => submitAvailability(true)} className="apple-btn apple-btn-secondary text-[13px]">I am available</button>
              <button disabled={saving} onClick={() => submitAvailability(false)} className="apple-btn apple-btn-secondary text-[13px]">Not available</button>
            </div>
            {message && <p className="text-[12px] text-[#868E96] mt-3">{message}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
