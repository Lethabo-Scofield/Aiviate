import { useEffect, useState } from "react";
import { Bot, Download, FileCheck2, Search } from "lucide-react";
import { SAMPLE_DOCUMENTS, createReportPdf, createSamplePdf } from "../lib/simulatedDocuments";
import PdfIcon from "./PdfIcon";

const PROMPTS = ["show jobs", "show drivers", "show alerts"];
const AGENT_ICONS = {
  "Operations Agent": Bot,
  "Document Research Agent": Search,
  "Report Agent": FileCheck2,
};

function AgentAvatar({ name }) {
  const Icon = AGENT_ICONS[name] || Bot;
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9ECEF] text-[#343A40]">
      <Icon size={17} strokeWidth={1.8} />
    </span>
  );
}

export default function EmptyChatOverview({ onPrompt, onProgress }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let active = true;
    const waiting = new Set();
    const objectUrls = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pause = (duration) => new Promise((resolve) => {
      const entry = { timer: null, resolve };
      entry.timer = window.setTimeout(() => {
        waiting.delete(entry);
        resolve(active);
      }, duration);
      waiting.add(entry);
    });
    const add = (message) => setMessages((previous) => [...previous, message]);
    const update = (id, patch) => setMessages((previous) =>
      previous.map((message) => message.id === id ? { ...message, ...patch } : message)
    );
    const speak = async (id, name, text, existing = false) => {
      if (!existing) add({ id, name, text: "", typing: true });
      else update(id, { working: null, text: "", typing: true });
      if (reducedMotion) {
        update(id, { text, typing: false });
        return true;
      }
      let typed = "";
      for (const character of Array.from(text)) {
        if (!await pause(18)) return false;
        typed += character;
        update(id, { text: typed });
      }
      update(id, { typing: false });
      return true;
    };

    const run = async () => {
      try {
        add({ id: "operations", name: "Operations Agent", working: "Preparing a document request" });
        if (!await pause(6000)) return;
        if (!await speak(
          "operations",
          "Operations Agent",
          "Document Research Agent, please find the PDFs for our operations review.",
          true
        )) return;

        add({ id: "research", name: "Document Research Agent", working: "Request received · searching the sample PDF library" });
        if (!await pause(6000)) return;
        const files = SAMPLE_DOCUMENTS.map((document) => {
          const url = URL.createObjectURL(createSamplePdf(document));
          objectUrls.push(url);
          return { ...document, url };
        });
        if (!await speak("research", "Document Research Agent", "I found these three sample PDFs. Adding them here now.", true)) return;
        for (let index = 0; index < files.length; index += 1) {
          if (!await pause(420)) return;
          update("research", { files: files.slice(0, index + 1) });
        }
        if (!await speak(
          "handoff",
          "Document Research Agent",
          "Report Agent, please generate a concise report from these PDFs."
        )) return;

        add({ id: "report", name: "Report Agent", working: "Request received · generating a report from the three sample PDFs" });
        if (!await pause(6000)) return;
        const reportUrl = URL.createObjectURL(createReportPdf(SAMPLE_DOCUMENTS));
        objectUrls.push(reportUrl);
        if (!await speak("report", "Report Agent", "The report is ready. You can download it below.", true)) return;
        update("report", { reportUrl });
      } catch {
        if (active) {
          update("research", { working: null });
          update("report", { working: null });
          add({
            id: "failure",
            name: "Report Agent",
            text: "The sample PDFs or report could not be generated. Start a new chat to try again.",
          });
        }
      }
    };

    setMessages([]);
    run();
    return () => {
      active = false;
      waiting.forEach(({ timer, resolve }) => {
        window.clearTimeout(timer);
        resolve(false);
      });
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    onProgress?.();
  }, [messages, onProgress]);

  return (
    <div className="mx-auto w-full max-w-[760px] pb-8 pt-7 sm:pt-10" data-testid="empty-chat-overview">
      <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.12em] text-[#868E96]">
        Simulation · sample documents
      </p>
      <div className="space-y-6" aria-label="Simulated agent conversation">
        {messages.map((message) => (
          <div key={message.id} className="flex items-start gap-3" data-testid={`agent-message-${message.id}`}>
            <AgentAvatar name={message.name} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[12px] font-semibold text-[#343A40]">{message.name}</p>
              {message.working ? (
                <p role="status" className="mt-1 flex items-center gap-2 text-[13px] text-[#697177]" data-testid={`status-${message.id}-working`}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#697177] motion-safe:animate-pulse" />
                  {message.working}…
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[14px] leading-[1.55] text-[#343A40]" aria-hidden={message.typing ? "true" : undefined}>
                    {message.text}
                    {message.typing && <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-[2px] bg-current motion-safe:animate-pulse" />}
                  </p>
                  {Array.isArray(message.files) && (
                    <div className="mt-3 divide-y divide-[#E9ECEF] border-y border-[#E9ECEF]" aria-label="Collected sample PDFs">
                      {message.files.map((file) => (
                        <a
                          key={file.id}
                          href={file.url}
                          download={file.name}
                          className="flex min-h-12 items-center gap-2.5 py-2 text-[12px] text-[#343A40] hover:text-[#111315] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#343A40]"
                          data-testid={`download-sample-${file.id}`}
                        >
                          <PdfIcon size={21} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          <Download size={14} className="shrink-0" aria-hidden="true" />
                          <span className="sr-only">Download sample PDF</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {message.reportUrl && (
                    <a
                      href={message.reportUrl}
                      download="aiviate-simulated-operations-report.pdf"
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#DEE2E6] bg-white px-3 text-[12px] font-semibold text-[#343A40] hover:bg-[#F1F3F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#343A40]"
                      data-testid="download-simulated-report"
                    >
                      <PdfIcon size={21} />
                      Download sample report.pdf
                      <Download size={14} aria-hidden="true" />
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-2" aria-label="Suggested prompts">
        {PROMPTS.map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt?.(prompt)}
            data-testid={`button-overview-prompt-${index}`}
            className="rounded-full border border-[#DEE2E6] bg-white px-3.5 py-2 text-left text-[12px] text-[#343A40] transition-colors hover:bg-[#F1F3F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#343A40]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}