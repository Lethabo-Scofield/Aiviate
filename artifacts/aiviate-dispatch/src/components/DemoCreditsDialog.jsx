import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Sparkles, X } from "lucide-react";

const PACKAGES = [
  { id: "starter", name: "Starter", price: 49, tokens: "500", description: "For a few extra conversations" },
  { id: "plus", name: "Plus", price: 99, tokens: "1,200", description: "For a busy day of dispatching", popular: true },
  { id: "team", name: "Team", price: 199, tokens: "3,000", description: "For an entire team to explore" },
];

const rand = (cents) => `R${(cents / 100).toFixed(2)}`;

export default function DemoCreditsDialog({ balanceCents, onClose, onComplete }) {
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
              {step === "success" ? "Your credit is ready" : step === "confirm" ? "Review your top-up" : "Add agent credit"}
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
          {step === "plans" && (
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

          {step === "confirm" && (
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

          {step === "success" && (
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
        {step !== "success" && <p className="border-t border-black/[0.06] px-6 py-3 text-center text-[11px] text-[#868E96]">Simulation only · No real purchase or agent tokens are issued</p>}
      </motion.div>
    </motion.div>
  );
}