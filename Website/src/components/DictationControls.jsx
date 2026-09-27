import { Mic, Square, X } from "lucide-react";

// Microphone / stop / cancel buttons for a prompt box, driven by useSpeechToText.
export function DictationButtons({ dictation, size = "md" }) {
  const { supported, status, toggle, cancel } = dictation;
  if (!supported) return null;
  const listening = status === "listening";
  const starting = status === "starting";
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "mb-1 h-9 w-9 rounded-xl";
  const icon = size === "sm" ? 13 : 16;

  return (
    <>
      {(listening || starting) && (
        <button
          type="button"
          onClick={cancel}
          className={`${box} flex shrink-0 items-center justify-center bg-[#F1F3F5] text-[#5C636A] transition-colors hover:bg-[#E9ECEF]`}
          aria-label="Cancel recording"
          title="Cancel"
        >
          <X size={icon} strokeWidth={1.6} />
        </button>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={starting}
        aria-pressed={listening}
        aria-label={listening ? "Stop recording" : "Speak your prompt"}
        title={listening ? "Stop recording" : "Speak your prompt"}
        className={`${box} flex shrink-0 items-center justify-center transition-colors disabled:opacity-60 ${
          listening
            ? "animate-ring-pulse bg-[#111315] text-white hover:bg-[#343A40]"
            : "bg-[#F1F3F5] text-[#111315] hover:bg-[#E9ECEF]"
        }`}
      >
        {listening ? <Square size={icon - 3} strokeWidth={1.6} fill="currentColor" /> : <Mic size={icon} strokeWidth={1.6} />}
      </button>
    </>
  );
}

// Status line under a prompt box: listening hint or a readable error.
export function DictationNotice({ dictation, className = "" }) {
  const { status, error, clearError } = dictation;
  if (error) {
    return (
      <p role="alert" className={`flex items-start gap-2 text-[12px] leading-snug text-[#C92A2A] ${className}`}>
        <span className="flex-1">{error}</span>
        <button type="button" onClick={clearError} className="shrink-0 underline">
          Dismiss
        </button>
      </p>
    );
  }
  if (status === "starting") {
    return (
      <p role="status" className={`text-[12px] text-[#868E96] ${className}`}>
        Waiting for microphone permission...
      </p>
    );
  }
  if (status === "listening") {
    return (
      <p role="status" className={`text-[12px] text-[#5C636A] ${className}`}>
        Listening... tap stop when you're done, then review or edit before sending.
      </p>
    );
  }
  return null;
}
