import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { getVoiceBriefing, sendVoiceTurn } from "../services/api";

const SpeechRecognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;

export default function VoiceMode({ open, onClose, onBriefing, onReply, assistantName, speakReplies = true }) {
  const [phase, setPhase] = useState("connecting");
  const [caption, setCaption] = useState("");
  const [answer, setAnswer] = useState("");
  const [hasAudio, setHasAudio] = useState(false);
  const [error, setError] = useState("");
  const [micError, setMicError] = useState("");
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const monitorRef = useRef(null);
  const contextRef = useRef(null);
  const sessionRef = useRef(0);
  const captionRef = useRef("");
  const heardRef = useRef(false);
  const interruptedIntroRef = useRef(false);
  const callbacksRef = useRef({ onBriefing, onReply });
  callbacksRef.current = { onBriefing, onReply };

  const stopMonitor = () => {
    window.clearInterval(monitorRef.current);
    monitorRef.current = null;
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
  };

  const stopListening = (submit = true) => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      if (submit) interruptedIntroRef.current = true;
      recorder.shouldSubmit = submit;
      recorder.stop();
    }
    stopMonitor();
  };

  const playResponse = async (response, generation) => {
    if (generation !== sessionRef.current) return false;
    setAnswer(response.summary || "");
    const audio = audioRef.current;
    if (!audio || !response.audio) {
      setError("The voice service returned no playable audio.");
      return false;
    }
    audio.src = `data:${response.mime_type || "audio/mpeg"};base64,${response.audio}`;
    setHasAudio(true);
    setPhase("speaking");
    try {
      await audio.play();
      return await new Promise((resolve) => {
        audio.onended = () => resolve(generation === sessionRef.current);
        audio.onerror = () => resolve(false);
        audio.onpause = () => resolve(false);
      });
    } catch {
      setError("Your browser blocked automatic sound. Tap Play to hear the response.");
      audio.onended = () => {
        if (generation !== sessionRef.current) return;
        if (streamRef.current) startListening(generation);
        else setPhase("ready");
      };
      return false;
    }
  };

  const startListening = (generation) => {
    if (generation !== sessionRef.current) return;
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setPhase("ready");
      setMicError("Microphone recording is unavailable in this browser. You can still type in chat.");
      return;
    }
    setError("");
    setCaption("");
    captionRef.current = "";
    heardRef.current = false;
    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stopMonitor();
        if (generation !== sessionRef.current || !recorder.shouldSubmit) {
          if (generation === sessionRef.current && !recorder.forBriefing) setPhase("ready");
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1000) { setPhase("ready"); return; }
        setPhase("processing");
        try {
          const response = await sendVoiceTurn(blob);
          if (generation !== sessionRef.current) return;
          callbacksRef.current.onReply({ heard: captionRef.current || "Voice message", summary: response.summary });
          if (speakReplies) {
            const played = await playResponse(response, generation);
            if (played) startListening(generation);
          } else {
            setAnswer(response.summary);
            startListening(generation);
          }
        } catch (e) {
          if (generation !== sessionRef.current) return;
          setPhase("ready");
          setError(e?.message || "The voice response failed. Please try again.");
        }
      };
      recorder.start();
      setPhase("listening");

      // Recognition supplies optional on-screen captions; the recorded audio,
      // not this browser-generated text, is what the voice agent responds to.
      const Recognition = SpeechRecognition();
      if (Recognition) {
        try {
          const recognition = new Recognition();
          recognition.lang = "en-ZA";
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            const text = Array.from(event.results).map((item) => item[0].transcript).join(" ").trim();
            captionRef.current = text;
            if (text) interruptedIntroRef.current = true;
            setCaption(text);
          };
          recognitionRef.current = recognition;
          recognition.start();
        } catch { /* Captions are optional; the audio recording still works. */ }
      }

      // Automatically send an utterance after a short pause, with a manual
      // stop button for noisy rooms or browsers without usable audio levels.
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) {
        monitorRef.current = window.setTimeout(() => stopListening(Boolean(captionRef.current)), 16000);
        return;
      }
      const context = new AudioContextType();
      contextRef.current = context;
      context.resume().catch(() => {});
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const started = Date.now();
      let heard = false;
      let lastSound = started;
      monitorRef.current = window.setInterval(() => {
        if (recorder.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        const now = Date.now();
        if (rms > 0.032) { heard = true; heardRef.current = true; interruptedIntroRef.current = true; lastSound = now; }
        if (heard && now - lastSound > 1400 && now - started > 900) stopListening(true);
        else if (now - started > 16000) stopListening(heard || Boolean(captionRef.current));
      }, 120);
    } catch (e) {
      stopListening(false);
      setPhase("ready");
      setMicError(e?.message || "Could not start the microphone.");
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const generation = ++sessionRef.current;
    setPhase("connecting");
    setCaption("");
    setAnswer("");
    setHasAudio(false);
    setError("");
    setMicError("");
    interruptedIntroRef.current = false;
    const begin = async () => {
      // Open the microphone on the first click. If the person starts talking,
      // their question wins; otherwise pause recording before speaking so
      // the agent cannot hear its own briefing.
      const briefingPromise = getVoiceBriefing();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (generation !== sessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        startListening(generation);
      } catch (e) {
        if (generation === sessionRef.current) {
          setMicError(e?.name === "NotAllowedError"
            ? "Allow microphone access to talk to the agent. The briefing can still play."
            : e?.name === "NotFoundError"
              ? "No microphone was found. Connect one to speak; you can still hear the briefing."
              : "This browser cannot access a microphone. Use a supported secure browser; you can still hear the briefing and type.");
        }
      }
      try {
        const response = await briefingPromise;
        if (generation !== sessionRef.current) return;
        callbacksRef.current.onBriefing(response.summary);
        if (interruptedIntroRef.current) {
          setAnswer(response.summary);
          return;
        }
        if (!speakReplies) {
          setAnswer(response.summary);
          return;
        }
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.forBriefing = true;
          stopListening(false);
        }
        const played = await playResponse(response, generation);
        if (played && streamRef.current) startListening(generation);
        else if (played) setPhase("ready");
      } catch (e) {
        if (generation !== sessionRef.current) return;
        setError(e?.message || "The briefing could not load.");
        if (streamRef.current && recorderRef.current?.state !== "recording" && !interruptedIntroRef.current) startListening(generation);
        else if (!streamRef.current) setPhase("ready");
      }
    };
    begin();
    return () => {
      ++sessionRef.current;
      audioRef.current?.pause();
      stopListening(false);
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // Callbacks are kept in a ref so chat updates cannot restart the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const working = phase === "connecting" || phase === "processing";
  const label = phase === "connecting" ? "Opening voice and preparing your briefing…"
    : phase === "speaking" ? `${assistantName} is speaking. Tap the microphone to interrupt.`
      : phase === "listening" ? "Listening now — speak naturally." : phase === "processing" ? "Working on your question…"
        : "Tap the microphone to speak again.";

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Voice mode">
      <div className="w-full max-w-[460px] rounded-[26px] border border-[#e4e8e9] bg-white p-5 shadow-[0_28px_80px_rgba(17,19,21,0.18)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold text-[#111315]">Talk to {assistantName}</p>
            <p className="text-[12px] text-[#778188]">{speakReplies ? "Voice and on-screen answers" : "Voice questions and on-screen answers"} · current business snapshot</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close voice mode" className="rounded-full p-2 text-[#5c636a] hover:bg-[#f1f3f5]"><X size={18} /></button>
        </div>
        <div className="py-7 text-center">
          <button
            type="button"
            disabled={working || Boolean(micError && !streamRef.current)}
            onClick={() => {
              if (phase === "listening") stopListening(true);
              else if (phase === "speaking") { audioRef.current?.pause(); startListening(sessionRef.current); }
              else startListening(sessionRef.current);
            }}
            aria-label={phase === "listening" ? "Finish speaking" : "Speak to Aiviate"}
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${phase === "listening" ? "border-[#27383d] bg-[#27383d] text-white animate-ring-pulse" : "border-[#dfe5e7] bg-[#f6f8f8] text-[#27383d] hover:bg-[#e9eeee]"}`}
          >{phase === "listening" ? <MicOff size={28} /> : <Mic size={28} />}</button>
          <p role="status" aria-live="polite" className="mt-5 text-[13px] text-[#435159]">{label}</p>
          {caption && <p className="mt-3 text-[13px] text-[#27383d]">You: {caption}</p>}
          {answer && <p className="mt-4 rounded-2xl bg-[#f4f6f6] px-4 py-3 text-left text-[13px] leading-relaxed text-[#27383d]">{answer}</p>}
          <audio ref={audioRef} controls preload="none" aria-label={`${assistantName} spoken response`} className={`mt-3 h-9 w-full ${hasAudio ? "" : "hidden"}`} />
          {error && <p role="alert" className="mt-3 text-[12px] text-[#934b3f]">{error}</p>}
          {micError && <p role="alert" className="mt-3 text-[12px] text-[#934b3f]">{micError}</p>}
        </div>
        <p className="border-t border-[#edf0f1] pt-3 text-center text-[11px] text-[#778188]">No calls, orders or other external actions are made in voice mode.</p>
      </div>
    </div>
  );
}