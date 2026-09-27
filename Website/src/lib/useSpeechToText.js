import { useCallback, useEffect, useRef, useState } from "react";

// Speech-to-text for prompt boxes. The transcript is written into the normal
// prompt input so the user can review or edit it before sending; it is never
// sent automatically.

export function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const ERROR_MESSAGES = {
  "not-allowed": "Microphone access is blocked. Allow the microphone in your browser settings and try again.",
  "service-not-allowed": "Microphone access is blocked. Allow the microphone in your browser settings and try again.",
  "no-speech": "We didn't hear anything. Tap the microphone and try again.",
  "audio-capture": "No microphone was found. Check that one is connected.",
  network: "Speech recognition needs a network connection. Check your connection and try again.",
  unsupported: "Voice input isn't supported in this browser. You can still type your prompt.",
  unknown: "Voice input stopped unexpectedly. Please try again.",
};

/**
 * status: "idle" | "starting" | "listening"
 * value/onChange: the controlled prompt text the transcript is merged into.
 */
export function useSpeechToText({ value, onChange, lang = "en-ZA" }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const baseRef = useRef("");
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const heardRef = useRef(false);
  const supported = Boolean(getSpeechRecognition());

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  const detach = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognitionRef.current = null;
  };

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError(ERROR_MESSAGES.unsupported);
      return;
    }
    setError("");
    heardRef.current = false;
    baseRef.current = valueRef.current || "";
    setStatus("starting");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (event) => {
      heardRef.current = true;
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      const base = baseRef.current;
      const joiner = base && !/\s$/.test(base) ? " " : "";
      onChangeRef.current(`${base}${joiner}${text.trim()}`);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      // "no-speech" after we already heard something is just the session ending.
      if (event.error === "no-speech" && heardRef.current) return;
      setError(ERROR_MESSAGES[event.error] || ERROR_MESSAGES.unknown);
    };
    recognition.onend = () => {
      detach();
      setStatus("idle");
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      detach();
      setStatus("idle");
      setError(ERROR_MESSAGES.unknown);
    }
  }, [lang]);

  // Stop and keep whatever was transcribed.
  const stop = useCallback(() => {
    recognitionRef.current?.stop?.();
  }, []);

  // Stop and throw away what was transcribed in this recording.
  const cancel = useCallback(() => {
    onChangeRef.current(baseRef.current);
    recognitionRef.current?.abort?.();
    detach();
    setStatus("idle");
  }, []);

  const toggle = useCallback(() => {
    if (status === "idle") start();
    else stop();
  }, [status, start, stop]);

  const clearError = useCallback(() => setError(""), []);

  useEffect(
    () => () => {
      recognitionRef.current?.abort?.();
      detach();
    },
    [],
  );

  return {
    supported,
    status,
    listening: status === "listening",
    busy: status !== "idle",
    error,
    start,
    stop,
    cancel,
    toggle,
    clearError,
  };
}
