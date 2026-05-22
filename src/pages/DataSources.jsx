import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Papa from "papaparse";
import {
  ChevronLeft, Globe, Upload, FolderOpen, Trash2, Check, AlertTriangle, Plus, FileText,
} from "lucide-react";

/** iOS-feel spring used for tap feedback (matches Operations.jsx). */
const TAP_SPRING = { type: "spring", stiffness: 420, damping: 26 };

const STORAGE_KEY = "deliverySources";

function loadSources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveSources(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const TYPES = {
  api: { label: "API endpoint", Icon: Globe, blurb: "Connect a URL Aiviate can pull from (saved locally for now)." },
  csv: { label: "CSV upload", Icon: Upload, blurb: "Drop a spreadsheet of stops." },
  folder: { label: "Folder watch", Icon: FolderOpen, blurb: "Watch a folder for new CSV files (browser-only)." },
};

/* ────────────────────────── helpers ─────────────────────────── */
function fmtDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return ""; }
}

/* ────────────────────────── page ─────────────────────────── */
export default function DataSources() {
  const [sources, setSources] = useState(() => loadSources());
  const [picker, setPicker] = useState(null); // 'api' | 'csv' | 'folder' | null
  const [toast, setToast] = useState(null);

  const showToast = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2600);
  };

  const addSource = (s) => {
    const next = [...sources, { ...s, id: `src_${Date.now()}`, created_at: new Date().toISOString() }];
    setSources(next);
    saveSources(next);
    setPicker(null);
    showToast(`Saved "${s.name}" as a source.`);
  };

  const removeSource = (id) => {
    const next = sources.filter((s) => s.id !== id);
    setSources(next);
    saveSources(next);
    showToast("Source removed.", "warn");
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      {/* Back link */}
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-[12.5px] text-[#86868b] hover:text-[#1d1d1f] mb-3"
      >
        <ChevronLeft size={14} /> Settings
      </Link>

      <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#1d1d1f] tracking-tight">
        Delivery data sources
      </h1>
      <p className="text-[13px] sm:text-[14px] text-[#86868b] mt-1 mb-6 sm:mb-8">
        Tell Aiviate where your stops come from. You can mix and match — connect an API, drop a CSV, or watch a folder.
      </p>

      {/* Honest scope notice */}
      <div className="mb-6 rounded-xl border border-[#008080]/20 bg-[#008080]/[0.04] p-3 flex items-start gap-2">
        <AlertTriangle size={14} className="text-[#008080] mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#1d1d1f] leading-snug">
          <span className="font-semibold">Heads up:</span> sources you add here are saved
          on this device. Automatic syncing into your job list will turn on once your
          team confirms the connection details — we don't pull data silently.
        </p>
      </div>

      {/* Configured sources */}
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#86868b] mb-2">
        Configured sources
      </p>
      <div className="apple-card divide-y divide-black/[0.06] mb-6">
        {sources.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-[13px] text-[#86868b]">No sources yet.</p>
            <p className="text-[12px] text-[#aeaeb2] mt-1">Add one below to get started.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sources.map((s) => {
              const T = TYPES[s.type] || TYPES.api;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  className="flex items-center gap-4 px-5 py-4 first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#f5f5f7] flex items-center justify-center shrink-0">
                    <T.Icon size={16} className="text-[#1d1d1f]" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1d1d1f] truncate">{s.name}</p>
                    <p className="text-[11.5px] text-[#86868b] mt-0.5 truncate">
                      {T.label}
                      {s.detail ? <> · <span className="font-mono">{s.detail}</span></> : null}
                      {s.row_count != null ? <> · {s.row_count.toLocaleString()} rows</> : null}
                    </p>
                    <p className="text-[10.5px] text-[#aeaeb2] mt-0.5">Added {fmtDate(s.created_at)}</p>
                  </div>
                  <motion.button
                    onClick={() => removeSource(s.id)}
                    aria-label={`Remove ${s.name}`}
                    whileTap={{ scale: 0.88 }}
                    transition={TAP_SPRING}
                    className="w-8 h-8 rounded-full hover:bg-[#ff3b30]/[0.08] text-[#86868b] hover:text-[#ff3b30] flex items-center justify-center shrink-0"
                  >
                    <Trash2 size={14} />
                  </motion.button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Add new source */}
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#86868b] mb-2">
        Add a source
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-8">
        {Object.entries(TYPES).map(([key, t]) => {
          const Icon = t.Icon;
          return (
            <motion.button
              key={key}
              onClick={() => setPicker(key)}
              whileTap={{ scale: 0.97 }}
              transition={TAP_SPRING}
              className="apple-card p-4 text-left hover:border-[#008080]/30 hover:bg-[#008080]/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[#f5f5f7] flex items-center justify-center">
                  <Icon size={15} className="text-[#1d1d1f]" strokeWidth={1.8} />
                </div>
                <p className="text-[13px] font-semibold text-[#1d1d1f]">{t.label}</p>
              </div>
              <p className="text-[11.5px] text-[#86868b] leading-snug">{t.blurb}</p>
              <p className="text-[11.5px] text-[#008080] mt-2 inline-flex items-center gap-1">
                <Plus size={11} /> Add
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Form sheet */}
      <AnimatePresence>
        {picker && (
          <SourceFormSheet
            type={picker}
            onCancel={() => setPicker(null)}
            onSave={addSource}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
          >
            <div className={`rounded-full px-4 py-2 text-[13px] shadow-lg flex items-center gap-2 ${
              toast.tone === "warn"
                ? "bg-[#1d1d1f] text-white"
                : "bg-[#008080] text-white"
            }`}>
              <Check size={14} />
              <span>{toast.msg}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────── form sheet ─────────────────────────── */
function SourceFormSheet({ type, onCancel, onSave }) {
  const t = TYPES[type];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-black/[0.06] p-5 sm:p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#f5f5f7] flex items-center justify-center">
            <t.Icon size={16} className="text-[#1d1d1f]" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[#1d1d1f]">Add {t.label.toLowerCase()}</p>
            <p className="text-[12px] text-[#86868b]">{t.blurb}</p>
          </div>
        </div>

        {type === "api" && <ApiForm onCancel={onCancel} onSave={onSave} />}
        {type === "csv" && <CsvForm onCancel={onCancel} onSave={onSave} />}
        {type === "folder" && <FolderForm onCancel={onCancel} onSave={onSave} />}
      </motion.div>
    </motion.div>
  );
}

function FormActions({ onCancel, canSave, saveLabel = "Save source" }) {
  return (
    <div className="flex items-center justify-end gap-2 mt-5">
      <motion.button
        type="button"
        onClick={onCancel}
        whileTap={{ scale: 0.95 }}
        transition={TAP_SPRING}
        className="text-[13px] font-medium px-3.5 py-2 rounded-full text-[#1d1d1f] hover:bg-[#f5f5f7]"
      >
        Cancel
      </motion.button>
      <motion.button
        type="submit"
        disabled={!canSave}
        whileTap={canSave ? { scale: 0.95 } : undefined}
        transition={TAP_SPRING}
        className={`text-[13px] font-medium px-3.5 py-2 rounded-full ${
          canSave
            ? "bg-[#008080] hover:bg-[#006666] text-white"
            : "bg-[#f5f5f7] text-[#aeaeb2] cursor-not-allowed"
        }`}
      >
        {saveLabel}
      </motion.button>
    </div>
  );
}

/* ───── API form ───── */
function ApiForm({ onCancel, onSave }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [interval, setInterval] = useState("15");

  const validUrl = (() => {
    try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:"; }
    catch { return false; }
  })();
  const canSave = name.trim() && validUrl;

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      type: "api",
      name: name.trim(),
      detail: url,
      config: { url, auth_header: auth || null, poll_minutes: Number(interval) || 15 },
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Name this source">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Shopify export"
          className="apple-input"
        />
      </Field>
      <Field label="Endpoint URL">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/deliveries"
          className="apple-input font-mono text-[12.5px]"
        />
        {url && !validUrl && (
          <p className="text-[11px] text-[#ff9500] mt-1">That doesn't look like a valid http(s) URL.</p>
        )}
      </Field>
      <Field label="Auth header (optional)">
        <input
          value={auth}
          onChange={(e) => setAuth(e.target.value)}
          placeholder='e.g. "Bearer sk-abc123…"'
          className="apple-input font-mono text-[12.5px]"
        />
        <p className="text-[11px] text-[#86868b] mt-1">
          Stored on this device only. Your team will move it to a secret when wiring the live sync.
        </p>
      </Field>
      <Field label="Check for new stops every">
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="apple-input"
        >
          <option value="5">5 minutes</option>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
        </select>
      </Field>
      <FormActions onCancel={onCancel} canSave={canSave} />
    </form>
  );
}

/* ───── CSV form ───── */
function CsvForm({ onCancel, onSave }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { rows, fields, sample }
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setPreview(null);
    setParsing(true);
    if (!name) {
      const base = f.name.replace(/\.[^.]+$/, "");
      setName(base);
    }
    // Single streaming pass: counts every row, keeps only the first few
    // for preview. Memory stays tiny even for huge files.
    let rowCount = 0;
    let fields = [];
    const sample = [];
    let firstErr = null;
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      step: (res) => {
        if (!fields.length && res.meta?.fields) fields = res.meta.fields;
        if (res.errors?.length && !firstErr) firstErr = res.errors[0];
        if (res.data) {
          rowCount += 1;
          if (sample.length < 3) sample.push(res.data);
        }
      },
      complete: () => {
        setParsing(false);
        if (firstErr) {
          setError(firstErr.message || "Couldn't parse this file.");
          return;
        }
        setPreview({ rows: rowCount, fields, sample });
      },
      error: (err) => { setParsing(false); setError(err.message || "Couldn't read the file."); },
    });
  };

  const canSave = !!(name.trim() && file && preview && !error);
  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      type: "csv",
      name: name.trim(),
      detail: file.name,
      row_count: preview.rows,
      config: { filename: file.name, columns: preview.fields },
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Name this source">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monday morning batch"
          className="apple-input"
        />
      </Field>
      <Field label="CSV file">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
          className="rounded-xl border border-dashed border-black/15 hover:border-[#008080]/40 hover:bg-[#008080]/[0.02] p-5 text-center cursor-pointer transition-colors"
        >
          <Upload size={18} className="text-[#86868b] mx-auto mb-1.5" />
          <p className="text-[13px] text-[#1d1d1f]">
            {file ? <span className="font-medium">{file.name}</span> : "Click to pick a file, or drop one here"}
          </p>
          <p className="text-[11px] text-[#86868b] mt-0.5">
            .csv with a header row · stays on your device
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>
        {parsing && <p className="text-[11.5px] text-[#86868b] mt-2">Reading…</p>}
        {error && (
          <p className="text-[11.5px] text-[#ff3b30] mt-2 flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        {preview && !error && (
          <div className="mt-3 rounded-lg bg-[#f5f5f7] p-2.5 text-[11.5px] text-[#1d1d1f]">
            <p className="flex items-center gap-1.5 mb-1.5">
              <FileText size={11} className="text-[#008080]" />
              <span className="font-medium">{preview.rows.toLocaleString()} rows</span>
              <span className="text-[#86868b]">· {preview.fields.length} columns</span>
            </p>
            <p className="text-[10.5px] text-[#86868b] font-mono truncate">
              {preview.fields.slice(0, 6).join(" · ")}
              {preview.fields.length > 6 ? ` · +${preview.fields.length - 6}` : ""}
            </p>
          </div>
        )}
      </Field>
      <FormActions onCancel={onCancel} canSave={canSave} />
    </form>
  );
}

/* ───── Folder form ───── */
function FolderForm({ onCancel, onSave }) {
  const supported = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const [name, setName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState(null);

  const pick = async () => {
    setError(null);
    try {
      const handle = await window.showDirectoryPicker();
      setFolderName(handle.name);
      if (!name) setName(handle.name);
    } catch (e) {
      if (e?.name !== "AbortError") setError(e?.message || "Couldn't open folder picker.");
    }
  };

  const canSave = !!(name.trim() && folderName);
  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      type: "folder",
      name: name.trim(),
      detail: folderName,
      config: { folder_name: folderName },
    });
  };

  if (!supported) {
    return (
      <div>
        <div className="rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/[0.04] p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-[#ff9500] mt-0.5 shrink-0" />
          <p className="text-[12px] text-[#1d1d1f]">
            <span className="font-semibold">Your browser can't open folders.</span>{" "}
            This needs a Chromium-based browser (Chrome, Edge, Arc). On Safari and Firefox,
            please upload a CSV instead.
          </p>
        </div>
        <div className="flex justify-end mt-5">
          <motion.button
            type="button"
            onClick={onCancel}
            whileTap={{ scale: 0.95 }}
            transition={TAP_SPRING}
            className="text-[13px] font-medium px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[#1d1d1f]"
          >
            Close
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <Field label="Name this source">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dispatch drop folder"
          className="apple-input"
        />
      </Field>
      <Field label="Folder">
        <motion.button
          type="button"
          onClick={pick}
          whileTap={{ scale: 0.97 }}
          transition={TAP_SPRING}
          className="w-full rounded-xl border border-dashed border-black/15 hover:border-[#008080]/40 hover:bg-[#008080]/[0.02] p-5 text-center transition-colors"
        >
          <FolderOpen size={18} className="text-[#86868b] mx-auto mb-1.5" />
          <p className="text-[13px] text-[#1d1d1f]">
            {folderName ? <span className="font-mono">{folderName}</span> : "Pick a folder"}
          </p>
          <p className="text-[11px] text-[#86868b] mt-0.5">
            Aiviate will only see files in this folder, with your permission.
          </p>
        </motion.button>
        {error && (
          <p className="text-[11.5px] text-[#ff3b30] mt-2 flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <p className="text-[11px] text-[#86868b] mt-2">
          Note: browsers don't let us keep watching a folder after you close this tab.
          For always-on syncing, your team should add a server-side connector.
        </p>
      </Field>
      <FormActions onCancel={onCancel} canSave={canSave} />
    </form>
  );
}

/* ───── tiny field shell ───── */
function Field({ label, children }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-[11.5px] uppercase tracking-wider font-semibold text-[#86868b] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
