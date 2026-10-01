"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

const MAX_BYTES = 4 * 1024 * 1024;
const COUNTRIES: [string, string][] = [
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["CA", "Canada"],
  ["SG", "Singapore"],
  ["IN", "India"],
  ["", "Anywhere"],
];

export function UploadForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { file: useId(), country: useId(), city: useId(), mode: useId(), err: useId() };

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError("That file is over 4 MB. Save a smaller PDF or a Word document and try again.");
      return;
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose your CV first.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = new FormData(e.currentTarget);
    body.set("cv", file);
    try {
      const res = await fetch("/api/scan", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; next?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "The upload did not go through. Try again.");
      router.push(data.next ?? "/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload did not go through. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sheet flex flex-col gap-4 p-4 sm:p-5" aria-describedby={error ? ids.err : undefined}>
      <label
        htmlFor={ids.file}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-start gap-1 rounded border border-dashed px-4 py-5 transition-colors ${
          dragging ? "border-pen bg-paper" : "border-ink-3 hover:border-ink-2"
        }`}
      >
        <span className="font-bold">{file ? file.name : "Drop your CV here, or choose a file"}</span>
        <span className="text-sm text-ink-2">
          {file ? `${Math.max(1, Math.round(file.size / 1024))} KB. Choose again to replace it.` : "PDF, Word or plain text, up to 4 MB."}
        </span>
        <input
          ref={inputRef}
          id={ids.file}
          name="cv"
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      {!compact && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.country} className="label">Country</label>
            <select id={ids.country} name="country" defaultValue="AU" className="field">
              {COUNTRIES.map(([code, name]) => (
                <option key={name} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.city} className="label">City or region</label>
            <input id={ids.city} name="city" className="field" placeholder="Melbourne" maxLength={80} autoComplete="address-level2" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.mode} className="label">Work arrangement</label>
            <select id={ids.mode} name="mode" defaultValue="any" className="field">
              <option value="any">Any</option>
              <option value="remote">Remote only</option>
              <option value="hybrid">Hybrid or onsite</option>
            </select>
          </div>
        </div>
      )}

      {error && (
        <p id={ids.err} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-pen" disabled={busy}>
          {busy ? "Reading your CV" : "Score my CV"}
        </button>
        <span className="text-sm text-ink-2">No account needed. We keep the extracted text, never the file.</span>
      </div>
    </form>
  );
}
