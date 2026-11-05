import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Sparkles, X } from "lucide-react";
import { PLANS, findPlan, formatPlanPrice } from "../lib/plans";

const PACKAGES = [
  { id: "starter", name: "Starter", price: 49, tokens: "500", description: "For a few extra conversations" },
  { id: "plus", name: "Plus", price: 99, tokens: "1,200", description: "For a busy day of dispatching", popular: true },
  { id: "team", name: "Team", price: 199, tokens: "3,000", description: "For an entire team to explore" },
];

const rand = (cents) => `R${(cents / 100).toFixed(2)}`;

export default function DemoCreditsDialog({ balanceCents, currentPlanId, onSelectPlan, onClose, onComplete }) {
  const currentPlan = findPlan(currentPlanId);
  const [mode, setMode] = useState("plan"); // plan | topup
  const [chosenPlan, setChosenPlan] = useState(currentPlan || PLANS[1]);
  const [planStep, setPlanStep] = useState("choose"); // choose | confirm | success
  const [selected, setSelected] = useState(PACKAGES[1]);
  const [step, setStep] = useState("plans");
  const [newBalance, setNewBalance] = useState(null);
  const closeRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = [...document.querySelectorAll('[data-credit-dialog] button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const completePlan = () => {
    onSelectPlan?.(chosenPlan.id);
    setPlanStep("success");
  };

  const complete = () => {
    const updated = onComplete(selected.price);
    setNewBalance(updated);
    setStep("success");
  };

  return (
    <motion.div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        data-credit-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-dialog-title"
        aria-describedby="credit-dialog-description"
        initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-[480px] max-h-[min(88vh,760px)] overflow-y-auto rounded-[24px] border border-black/[0.07] bg-white shadow-[0_30px_90px_rgba(17,19,21,0.22)]"
      >
        <div className="flex items-start justify-between border-b border-black/[0.06] px-6 py-5">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#868E96]">Aiviate Agent · Demo</p>
            <h2 id="credit-dialog-title" className="text-[22px] font-semibold text-[#111315]">
              {mode === "plan"
                ? planStep === "success" ? "Your plan is updated" : planStep === "confirm" ? "Review your plan" : "Choose your plan"
                : step === "success" ? "Your credit is ready" : step === "confirm" ? "Review your top-up" : "Add agent credit"}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close credit dialog"
            data-testid="button-close-credit-dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#5C636A] transition-colors hover:bg-[#F1F3F5] hover:text-[#111315]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {!(mode === "plan" ? planStep === "success" : step === "success") && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[#F1F3F5] p-1" role="group" aria-label="Upgrade options">
              {[["plan", "Plans"], ["topup", "Top up credit"]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setMode(id); setPlanStep("choose"); setStep("plans"); }}
                  aria-pressed={mode === id}
                  data-testid={`button-upgrade-tab-${id}`}
                  className={`rounded-lg py-2 text-[12px] font-semibold transition-colors ${mode === id ? "bg-white text-[#111315] shadow-sm" : "text-[#5C636A] hover:text-[#111315]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "plan" && planStep === "choose" && (
            <>
              <p id="credit-dialog-description" className="mb-4 text-[13px] leading-relaxed text-[#5C636A]">
                Pick the plan that fits your drivers. Every plan includes a monthly allowance of AI credits; top up any time.
              </p>
              <div className="space-y-2.5" role="group" aria-label="Aiviate plans">
                {PLANS.map((plan) => {
                  const active = chosenPlan.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setChosenPlan(plan)}
                      aria-pressed={active}
                      data-testid={`button-plan-${plan.id}`}
                      className={`w-full rounded-2xl border p-4 text-left transition-[border-color,background-color] focus-visible:outline-2 focus-visible:outline-[#111315] ${
                        active ? "border-[#111315] bg-[#F8F9FA]" : "border-black/[0.08] bg-white hover:border-black/[0.22]"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          active ? "border-[#111315] bg-[#111315] text-white" : "border-[#ADB5BD]"
                        }`}>{active && <Check size={12} strokeWidth={2.5} />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#111315]">
                            {plan.name}
                            {currentPlan?.id === plan.id && <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-medium text-[#2F6B45]">Current plan</span>}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-[#5C636A]">{plan.tagline}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[16px] font-semibold tabular-nums text-[#111315]">{formatPlanPrice(plan.price)}</span>
                          <span className="block text-[11px] text-[#868E96]">{plan.unitShort}</span>
                        </span>
                      </span>
                      {active && (
                        <ul className="mt-3 space-y-1 border-t border-black/[0.06] pt-3 pl-8 text-[12px] text-[#5C636A]">
                          {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                          {plan.term && <li className="font-medium text-[#343A40]">{plan.term}</li>}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[#868E96]">Prices in South African rand per month; VAT to be confirmed.</p>
              <button
                type="button"
                onClick={() => setPlanStep("confirm")}
                disabled={currentPlan?.id === chosenPlan.id}
                data-testid="button-review-plan"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111315] py-3 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {currentPlan?.id === chosenPlan.id ? `You're on ${chosenPlan.name}` : <>Continue with {chosenPlan.name} <ArrowRight size={15} /></>}
              </button>
            </>
          )}

          {mode === "plan" && planStep === "confirm" && (
            <>
              <p id="credit-dialog-description" className="mb-5 text-[13px] leading-relaxed text-[#5C636A]">A clear summary before you switch.</p>
              <div className="rounded-2xl border border-black/[0.08] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#111315]"><Sparkles size={17} /></span>
                    <div>
                      <p className="text-[14px] font-semibold text-[#111315]">Aiviate {chosenPlan.name}</p>
                      <p className="text-[12px] text-[#5C636A]">{chosenPlan.tagline}</p>
                    </div>
                  </div>
                  <span className="text-right text-[14px] font-semibold tabular-nums text-[#111315]">
                    {formatPlanPrice(chosenPlan.price)}
                    <span className="block text-[11px] font-normal text-[#868E96]">{chosenPlan.unit}</span>
                  </span>
                </div>
                {chosenPlan.term && (
                  <p className="mt-4 border-t border-black/[0.08] pt-3 text-[12px] text-[#5C636A]">{chosenPlan.term}.</p>
                )}
              </div>
              <div className="mt-4 rounded-xl bg-[#F8F9FA] p-3 text-[12px] leading-relaxed text-[#5C636A]">
                <strong className="text-[#111315]">Demo checkout.</strong> No payment is taken and no devices are ordered. This only records your plan choice in this browser.
              </div>
              <button
                type="button"
                onClick={completePlan}
                data-testid="button-complete-plan"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111315] py-3 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                Switch to {chosenPlan.name} <ArrowRight size={15} />
              </button>
              <button type="button" onClick={() => setPlanStep("choose")} className="mt-3 flex w-full items-center justify-center gap-2 py-2 text-[12px] font-medium text-[#5C636A] hover:text-[#111315]" data-testid="button-back-to-plans">
                <ArrowLeft size={14} /> Change plan
              </button>
            </>
          )}

          {mode === "plan" && planStep === "success" && (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#111315]"><CheckCircle2 size={28} strokeWidth={1.5} /></span>
              <p id="credit-dialog-description" className="mt-5 text-[14px] font-medium text-[#111315]">You&apos;re on {chosenPlan.name} (demo)</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#5C636A]">{formatPlanPrice(chosenPlan.price)} {chosenPlan.unit}. Nothing was charged and no devices were ordered in this simulation.</p>
              <button type="button" onClick={onClose} data-testid="button-finish-plan" className="mt-5 w-full rounded-xl bg-[#111315] py-3 text-[13px] font-semibold text-white">
                Done
              </button>
            </div>
          )}

          {mode === "topup" && step === "plans" && (
            <>
              <div className="mb-5 flex items-center justify-between rounded-2xl bg-[#F8F9FA] px-4 py-3">
                <span className="text-[13px] text-[#5C636A]">Current company credit</span>
                <span className="text-[19px] font-semibold tabular-nums text-[#111315]" data-testid="text-current-credit">{rand(balanceCents)}</span>
              </div>
              <p id="credit-dialog-description" className="mb-4 text-[13px] leading-relaxed text-[#5C636A]">
                Choose a top-up to give your agent more room to work. Token amounts are estimates for this demo.
              </p>
              <div className="space-y-2.5" role="group" aria-label="Agent credit packages">
                {PACKAGES.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setSelected(pack)}
                    aria-pressed={selected.id === pack.id}
                    data-testid={`button-package-${pack.id}`}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-[border-color,background-color,transform] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-[#111315] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                      selected.id === pack.id ? "border-[#111315] bg-[#F8F9FA]" : "border-black/[0.08] bg-white hover:border-black/[0.22]"
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected.id === pack.id ? "border-[#111315] bg-[#111315] text-white" : "border-[#ADB5BD]"
                    }`}>{selected.id === pack.id && <Check size={12} strokeWidth={2.5} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px] font-semibold text-[#111315]">
                        {pack.name}
                        {pack.popular && <span className="rounded-full bg-[#F1F3F5] px-2 py-0.5 text-[10px] font-medium text-[#5C636A]">Popular</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-[#5C636A]">~{pack.tokens} agent tokens · {pack.description}</span>
                    </span>
                    <span className="shrink-0 text-[16px] font-semibold tabular-nums text-[#111315]">R{pack.price}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                data-testid="button-review-demo-topup"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111315] py-3 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                Continue with {selected.name} <ArrowRight size={15} />
              </button>
            </>
          )}

          {mode === "topup" && step === "confirm" && (
            <>
              <p id="credit-dialog-description" className="mb-5 text-[13px] leading-relaxed text-[#5C636A]">A clear summary before your simulated purchase.</p>
              <div className="rounded-2xl border border-black/[0.08] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#111315]"><Sparkles size={17} /></span>
                    <div>
                      <p className="text-[14px] font-semibold text-[#111315]">{selected.name} agent credit</p>
                      <p className="text-[12px] text-[#5C636A]">About {selected.tokens} agent tokens</p>
                    </div>
                  </div>
                  <span className="text-[14px] font-semibold tabular-nums text-[#111315]">R{selected.price}.00</span>
                </div>
                <div className="mt-5 flex justify-between border-t border-black/[0.08] pt-4 text-[13px]">
                  <span className="text-[#5C636A]">Demo total</span>
                  <span className="font-semibold text-[#111315]">R{selected.price}.00</span>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-[#F8F9FA] p-3 text-[12px] leading-relaxed text-[#5C636A]">
                <strong className="text-[#111315]">Demo checkout.</strong> No card details are needed. No payment will be taken. This only changes your demo balance in this browser.
              </div>
              <button
                type="button"
                onClick={complete}
                data-testid="button-complete-demo-topup"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111315] py-3 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                Complete demo top-up <ArrowRight size={15} />
              </button>
              <button type="button" onClick={() => setStep("plans")} className="mt-3 flex w-full items-center justify-center gap-2 py-2 text-[12px] font-medium text-[#5C636A] hover:text-[#111315]" data-testid="button-back-to-packages">
                <ArrowLeft size={14} /> Change package
              </button>
            </>
          )}

          {mode === "topup" && step === "success" && (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#111315]"><CheckCircle2 size={28} strokeWidth={1.5} /></span>
              <p id="credit-dialog-description" className="mt-5 text-[14px] font-medium text-[#111315]">Demo top-up complete</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#5C636A]">R{selected.price}.00 in agent credit has been added. That&apos;s about {selected.tokens} more tokens to explore in this simulation.</p>
              <div className="mt-5 rounded-2xl bg-[#F8F9FA] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[#868E96]">New demo balance</p>
                <p className="mt-1 text-[28px] font-semibold tabular-nums text-[#111315]" data-testid="text-new-credit">{rand(newBalance ?? balanceCents)}</p>
              </div>
              <button type="button" onClick={onClose} data-testid="button-finish-demo-topup" className="mt-5 w-full rounded-xl bg-[#111315] py-3 text-[13px] font-semibold text-white">
                Done
              </button>
            </div>
          )}
        </div>
        {(mode === "plan" ? planStep !== "success" : step !== "success") && (
          <p className="border-t border-black/[0.06] px-6 py-3 text-center text-[11px] text-[#868E96]">
            {mode === "plan" ? "Simulation only · No real purchase, subscription or devices" : "Simulation only · No real purchase or agent tokens are issued"}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}