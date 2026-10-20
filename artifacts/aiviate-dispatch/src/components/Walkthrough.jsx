import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { isTourDone, markTourDone, onReplayTour } from "../lib/tour";

const PAD = 8;
const CARD_W = 340;

// A target counts only when it is actually on screen (the mobile sidebar is
// translated off-canvas, for example); otherwise the step shows centred.
function visibleRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  if (r.right <= 0 || r.left >= window.innerWidth) return null;
  return r;
}

function cardPosition(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect || vw < 640) return null; // centred / bottom sheet
  const width = Math.min(CARD_W, vw - 32);
  const left = Math.min(Math.max(16, rect.left), vw - width - 16);
  const below = rect.bottom + PAD + 12;
  if (vh - below > 200) return { top: below, left, width };
  const right = rect.right + PAD + 12;
  if (vw - right > width + 16) return { top: Math.max(16, Math.min(rect.top, vh - 240)), left: right, width };
  // Above the target: anchor by the bottom edge so the card's height never overlaps it.
  return { bottom: vh - rect.top + PAD + 12, left, width };
}

export default function Walkthrough({ steps, storageKey, autoStart = true }) {
  const [index, setIndex] = useState(-1);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const running = index >= 0;
  const step = running ? steps[index] : null;

  const finish = useCallback(() => {
    markTourDone(storageKey);
    setIndex(-1);
  }, [storageKey]);

  useEffect(() => {
    if (!autoStart || isTourDone(storageKey)) return undefined;
    const timer = window.setTimeout(() => setIndex(0), 900);
    return () => window.clearTimeout(timer);
  }, [autoStart, storageKey]);

  useEffect(() => onReplayTour(() => setIndex(0)), []);

  // Move to the step's page, then wait briefly for its target to render.
  useEffect(() => {
    if (!step) return undefined;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      return undefined;
    }
    let tries = 0;
    let timer;
    const locate = () => {
      const found = visibleRect(step.target);
      if (found || tries >= 15 || !step.target) {
        if (found) {
          document.querySelector(step.target)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        setRect(found);
        return;
      }
      tries += 1;
      timer = window.setTimeout(locate, 100);
    };
    setRect(null);
    locate();
    return () => window.clearTimeout(timer);
  }, [step, location.pathname, navigate]);

  useEffect(() => {
    if (!step) return undefined;
    const update = () => setRect(visibleRect(step.target));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (running) cardRef.current?.focus();
  }, [running, index]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) finish();
    else setIndex(index + 1);
  }, [index, steps.length, finish]);
  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!running) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, next, finish]);

  if (!running) return null;

  const pos = cardPosition(rect);
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[300]" aria-live="polite">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-2xl ring-2 ring-white/80 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(10, 12, 14, 0.58)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[rgba(10,12,14,0.58)]" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        data-testid="walkthrough-card"
        className={`fixed rounded-2xl border border-black/[0.08] bg-white p-5 text-left shadow-[0_24px_60px_rgba(17,19,21,0.28)] outline-none ${
          pos ? "" : "inset-x-4 bottom-4 mx-auto max-w-[400px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
        }`}
        style={pos || undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#868E96]">
            Step {index + 1} of {steps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip tour"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[#868E96] hover:bg-[#F1F3F5] hover:text-[#111315]"
          >
            <X size={15} />
          </button>
        </div>
        <h2 id="tour-title" className="mt-1.5 text-[17px] font-semibold tracking-tight text-[#111315]">{step.title}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5C636A]">{step.body}</p>

        <div className="mt-4 flex items-center gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#111315]" : "w-1.5 bg-[#DEE2E6]"}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-[13px] font-medium text-[#868E96] hover:text-[#111315]">
            Skip
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={back} className="apple-btn apple-btn-secondary !px-3.5 !py-2 text-[13px]">
                Back
              </button>
            )}
            <button type="button" onClick={next} data-testid="walkthrough-next" className="apple-btn apple-btn-primary !px-4 !py-2 text-[13px]">
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
