import { useEffect, useState } from "react";
import { BedDouble, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { getLatestWellnessCheckin, getWellnessQuestions, submitWellnessCheckin } from "../services/api";

const RISK = {
  low: { label: "Good to go", icon: ShieldCheck, tone: "bg-[#E6F6EE] text-[#1E7B4D]" },
  medium: { label: "Drive with care", icon: ShieldAlert, tone: "bg-[#FFF4E0] text-[#9A5B00]" },
  high: { label: "Rest before driving", icon: ShieldAlert, tone: "bg-[#FDECEC] text-[#B42318]" },
};

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return d.toDateString() === new Date().toDateString();
}

export default function FatigueCheckin() {
  const [latest, setLatest] = useState(null);
  const [advice, setAdvice] = useState("");
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(-1); // -1: summary, 0..n-1: question
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    getLatestWellnessCheckin()
      .then((res) => { setLatest(res.checkin); setAdvice(res.advice || ""); })
      .catch(() => setUnavailable(true));
  }, []);

  const start = async () => {
    setError("");
    try {
      if (!questions) setQuestions((await getWellnessQuestions()).questions);
      setAnswers({});
      setStep(0);
    } catch (e) {
      setError(e.message || "Could not load the check-in.");
    }
  };

  const toggle = (q, optionId) => {
    setAnswers((prev) => {
      if (!q.multi) return { ...prev, [q.id]: optionId };
      const current = prev[q.id] || [];
      if (optionId === "none") return { ...prev, [q.id]: ["none"] };
      const without = current.filter((id) => id !== "none" && id !== optionId);
      return { ...prev, [q.id]: current.includes(optionId) ? without : [...without, optionId] };
    });
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await submitWellnessCheckin(answers);
      setLatest(res.checkin);
      setAdvice(res.advice);
      setStep(-1);
    } catch (e) {
      setError(e.message || "Could not save your check-in.");
    } finally {
      setBusy(false);
    }
  };

  if (unavailable) return null;

  const doneToday = latest && isToday(latest.created_at);
  const q = step >= 0 && questions ? questions[step] : null;
  const answered = q && (q.multi ? (answers[q.id] || []).length > 0 : Boolean(answers[q.id]));

  return (
    <section data-tour="checkin" className="apple-card mb-5 p-5" aria-labelledby="checkin-title">
      {q ? (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#868E96]">
              Pre-drive check-in · {step + 1} of {questions.length}
            </p>
            <button type="button" onClick={() => setStep(-1)} className="text-[12px] font-medium text-[#868E96] hover:text-[#111315]">Cancel</button>
          </div>
          <h2 id="checkin-title" className="mt-2 text-[16px] font-semibold text-[#111315]">{q.prompt}</h2>
          {q.multi && <p className="mt-0.5 text-[12px] text-[#868E96]">Pick all that apply.</p>}
          <div className="mt-3 grid gap-2" role={q.multi ? "group" : "radiogroup"} aria-labelledby="checkin-title">
            {q.options.map((o) => {
              const selected = q.multi ? (answers[q.id] || []).includes(o.id) : answers[q.id] === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role={q.multi ? "checkbox" : "radio"}
                  aria-checked={selected}
                  onClick={() => toggle(q, o.id)}
                  className={`rounded-xl border px-3.5 py-3 text-left text-[14px] transition-colors ${
                    selected ? "border-[#111315] bg-[#111315] text-white" : "border-[#DEE2E6] bg-white text-[#343A40] hover:border-[#ADB5BD]"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {error && <p role="alert" className="mt-3 text-[13px] text-[#B42318]">{error}</p>}
          <div className="mt-4 flex justify-between">
            <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="apple-btn apple-btn-secondary disabled:opacity-40">Back</button>
            {step < questions.length - 1 ? (
              <button type="button" disabled={!answered} onClick={() => setStep(step + 1)} className="apple-btn apple-btn-primary disabled:opacity-40">Next</button>
            ) : (
              <button type="button" disabled={!answered || busy} onClick={submit} className="apple-btn apple-btn-primary disabled:opacity-40">
                {busy ? "Saving..." : "Submit check-in"}
              </button>
            )}
          </div>
        </div>
      ) : doneToday ? (
        <CheckinSummary latest={latest} advice={advice} onAgain={start} error={error} />
      ) : (
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5]">
            <BedDouble size={18} className="text-[#111315]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="checkin-title" className="text-[15px] font-semibold text-[#111315]">Before you drive: quick check-in</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#5C636A]">
              Four questions about sleep and anything that could make you tired today. If you're at risk, your dispatcher is told so they can help.
            </p>
            {error && <p role="alert" className="mt-2 text-[13px] text-[#B42318]">{error}</p>}
            <button type="button" onClick={start} data-testid="button-start-checkin" className="apple-btn apple-btn-primary mt-3">Start check-in</button>
          </div>
        </div>
      )}
    </section>
  );
}

function CheckinSummary({ latest, advice, onAgain, error }) {
  const risk = RISK[latest.risk_level] || RISK.low;
  const Icon = risk.icon;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="checkin-title" className="flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-[#111315]">
          <CheckCircle2 size={16} className="text-[#1E7B4D]" /> Checked in today
        </h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${risk.tone}`}>
          <Icon size={13} /> {risk.label}
        </span>
      </div>
      {advice && <p className="mt-2 text-[13px] leading-relaxed text-[#5C636A]">{advice}</p>}
      {latest.reasons?.length > 0 && (
        <p className="mt-2 text-[12px] text-[#868E96]">You mentioned: {latest.reasons.join(", ")}.</p>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-[#B42318]">{error}</p>}
      <button type="button" onClick={onAgain} className="mt-3 text-[13px] font-semibold text-[#111315] underline-offset-2 hover:underline">
        Feeling different? Check in again
      </button>
    </div>
  );
}
