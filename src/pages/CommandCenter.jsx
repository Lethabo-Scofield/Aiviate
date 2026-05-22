import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  Eye,
  Radio,
  X,
  ChevronRight,
  Sparkles,
  Zap,
  History,
} from "lucide-react";
import {
  getRecommendations,
  acknowledgeRecommendation,
  getAuditLog,
} from "../services/api";

const CATEGORY_META = {
  "Driver risk": { color: "#ff3b30", icon: Eye },
  "Telemetry": { color: "#0a84ff", icon: Camera },
  "Critical alert": { color: "#ff3b30", icon: AlertTriangle },
  "Dispatch": { color: "#ff9500", icon: Radio },
  "Delay": { color: "#ff9500", icon: Clock },
};

const SEVERITY_LABEL = {
  critical: { label: "Critical", color: "#ff3b30" },
  high: { label: "High", color: "#ff3b30" },
  medium: { label: "Medium", color: "#ff9500" },
  low: { label: "Low", color: "#34c759" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RecommendationCard({ rec, onAcknowledge, onDismiss, onOpen }) {
  const meta = CATEGORY_META[rec.category] || CATEGORY_META["Delay"];
  const Icon = meta.icon;
  const sev = SEVERITY_LABEL[rec.severity] || SEVERITY_LABEL.medium;
  return (
    <div className="apple-card p-4 sm:p-5 flex items-start gap-3 sm:gap-4">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${meta.color}1A`, color: meta.color }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}14`, color: meta.color }}
          >
            {rec.category}
          </span>
          <span
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${sev.color}14`, color: sev.color }}
          >
            {sev.label}
          </span>
          <span className="text-[10px] text-[#aeaeb2] flex items-center gap-1">
            <Sparkles size={10} /> {Math.round(rec.confidence * 100)}% confidence
          </span>
          {!rec.requires_approval && (
            <span className="text-[10px] text-[#34c759]">No approval needed</span>
          )}
        </div>
        <p className="text-[14px] font-semibold text-[#1d1d1f] leading-snug">{rec.what}</p>
        {rec.why && <p className="text-[12px] text-[#86868b] mt-1 leading-snug">{rec.why}</p>}
        <p className="text-[12px] text-[#1d1d1f] mt-2 flex items-start gap-1.5">
          <Zap size={12} className="text-[#008080] mt-0.5 shrink-0" />
          <span>
            <span className="text-[#86868b]">Recommended: </span>
            {rec.action}
          </span>
        </p>
        {rec.expected_benefit && (
          <p className="text-[11px] text-[#86868b] mt-1 italic">→ {rec.expected_benefit}</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onAcknowledge(rec)}
            className="apple-btn apple-btn-primary text-[12px] py-1.5 px-3"
          >
            <CheckCircle2 size={12} /> Acknowledge
          </button>
          {rec.link && (
            <button
              onClick={() => onOpen(rec.link)}
              className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3"
            >
              Open <ChevronRight size={12} />
            </button>
          )}
          <button
            onClick={() => onDismiss(rec.id)}
            className="text-[12px] text-[#aeaeb2] hover:text-[#86868b] ml-auto px-2 py-1"
          >
            <X size={12} className="inline" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const [recs, setRecs] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("dismissedRecs") || "[]")); }
    catch { return new Set(); }
  });

  const load = async () => {
    try {
      const [recResp, auditResp] = await Promise.all([
        getRecommendations(),
        getAuditLog(15),
      ]);
      setRecs(Array.isArray(recResp?.recommendations) ? recResp.recommendations : []);
      setAuditEntries(Array.isArray(auditResp?.entries) ? auditResp.entries : []);
      setLoadError(null);
      setLastSyncAt(new Date().toISOString());
    } catch (e) {
      setLoadError(e?.message || "Could not reach intelligence service");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  const visibleRecs = recs.filter((r) => !dismissed.has(r.id));

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem("dismissedRecs", JSON.stringify([...next]));
  };

  const acknowledge = async (rec) => {
    dismiss(rec.id);
    try {
      await acknowledgeRecommendation(rec.id, {
        summary: `Acknowledged: ${rec.what}`,
        kind: rec.kind,
      });
      const fresh = await getAuditLog(15);
      setAuditEntries(Array.isArray(fresh?.entries) ? fresh.entries : []);
    } catch (e) {
      console.warn("Acknowledge failed:", e?.message);
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="skeleton h-8 w-56 mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="apple-card p-6">
              <div className="skeleton h-4 w-2/3 mb-2" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 sm:mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Brain size={22} className="text-[#008080]" /> Command Center
          </h1>
          <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1">
            What needs your decision, right now. Generated by the intelligence layer from live telemetry and safety events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#aeaeb2] uppercase tracking-wider font-semibold">Decisions waiting</span>
          <span
            className="text-[18px] font-semibold px-3 py-1 rounded-full"
            style={{ background: visibleRecs.length > 0 ? "#ff3b30" : "#34c759", color: "white" }}
          >
            {visibleRecs.length}
          </span>
        </div>
      </div>

      {loadError && !lastSyncAt ? (
        <div className="apple-card p-10 text-center border-2 border-[#ff3b30]/20">
          <div className="w-14 h-14 rounded-2xl bg-[#ff3b30]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-[#ff3b30]" />
          </div>
          <p className="text-[16px] font-semibold text-[#1d1d1f]">Intelligence service unreachable</p>
          <p className="text-[13px] text-[#86868b] mt-1">
            We can't tell you what's happening right now. Treat this as unknown, not safe. ({loadError})
          </p>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3 mt-4"
          >
            Retry
          </button>
        </div>
      ) : visibleRecs.length === 0 ? (
        recs.length === 0 ? (
          <div className="apple-card p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#34c759]/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-[#34c759]" />
            </div>
            <p className="text-[16px] font-semibold text-[#1d1d1f]">No risks detected</p>
            <p className="text-[13px] text-[#86868b] mt-1">
              The intelligence layer is running — no drowsy drivers, no offline devices, no open critical alerts, no blocked routes.
            </p>
            {loadError && (
              <p className="text-[11px] text-[#ff9500] mt-2">
                Last refresh failed ({loadError}). Showing last known state from {timeAgo(lastSyncAt)}.
              </p>
            )}
          </div>
        ) : (
          <div className="apple-card p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#aeaeb2]/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-[#86868b]" />
            </div>
            <p className="text-[16px] font-semibold text-[#1d1d1f]">All {recs.length} acknowledged this session</p>
            <p className="text-[13px] text-[#86868b] mt-1">
              Underlying risks may still be active — acknowledging only hides the card.
            </p>
            <button
              onClick={() => { setDismissed(new Set()); sessionStorage.removeItem("dismissedRecs"); }}
              className="apple-btn apple-btn-secondary text-[12px] py-1.5 px-3 mt-4"
            >
              Show dismissed
            </button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {visibleRecs.map((r) => (
            <RecommendationCard
              key={r.id}
              rec={r}
              onAcknowledge={acknowledge}
              onDismiss={dismiss}
              onOpen={(link) => navigate(link)}
            />
          ))}
        </div>
      )}

      {/* Handled — audit log */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-wider font-semibold text-[#86868b]">
          <History size={12} />
          Recently handled
        </div>
        {auditEntries.length === 0 ? (
          <div className="apple-card p-5 text-center">
            <p className="text-[13px] text-[#86868b]">
              No actions logged yet. Autonomous workflows and operator acknowledgements appear here.
            </p>
          </div>
        ) : (
          <div className="apple-card divide-y divide-black/[0.06]">
            {auditEntries.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#008080]/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={13} className="text-[#008080]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#1d1d1f] leading-snug">{e.summary}</p>
                  <p className="text-[11px] text-[#86868b] mt-0.5">
                    {e.actor === "workflow_engine" ? "Automatic" : "Operator"} · {timeAgo(e.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
