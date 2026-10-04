"use client";

import { useId, useState } from "react";
import type { ProfileAudit } from "@/lib/linkedin/profile";

const TONE = { high: "hl-gap", medium: "hl-unknown", low: "" } as const;
const STATUS = { pass: "Looks good", "needs-work": "Needs work", "not-provided": "Not in the PDF" } as const;

export function LinkedInAudit() {
  const id = useId();
  const [audit, setAudit] = useState<ProfileAudit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/audit", { method: "POST", body: new FormData(e.currentTarget) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; audit?: ProfileAudit };
      if (!res.ok || !data.ok || !data.audit) throw new Error(data.error ?? "The audit did not go through. Try again.");
      setAudit(data.audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The audit did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="sheet flex flex-col gap-3 p-4 sm:p-5">
        <label htmlFor={id} className="font-bold">Your LinkedIn profile as a PDF</label>
        <p className="text-sm text-ink-2">On your profile choose More, then Save to PDF. The file is read once and not stored.</p>
        <input id={id} name="profile" type="file" accept=".pdf,application/pdf" required aria-describedby={error ? `${id}-err` : undefined} />
        {error && <p id={`${id}-err`} role="alert" className="text-sm"><span className="hl hl-gap">{error}</span></p>}
        <button type="submit" className="btn self-start" disabled={busy}>{busy ? "Reading" : "Audit my profile"}</button>
      </form>

      {audit && (
        <section aria-live="polite" className="flex flex-col gap-8">
          <div className="flex items-end justify-between gap-4">
            <p className="text-ink-2">Scored on {audit.scored} of {audit.sections.length} profile sections. The rest are not in the PDF, so they are not marked.</p>
            <p className="score text-6xl">
              <span className={`hl ${audit.score >= 8 ? "hl-match" : audit.score >= 5 ? "hl-unknown" : "hl-gap"}`}>{audit.score}</span>
              <span className="text-2xl text-ink-3">/10</span>
            </p>
          </div>

          <ul className="grid gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-3">
            {audit.sections.map((s) => (
              <li key={s.key} className="bg-sheet p-3">
                <p className="label">{s.label}</p>
                <p className="font-bold">{STATUS[s.status]}</p>
              </li>
            ))}
          </ul>

          {audit.flags.length > 0 && (
            <div>
              <h2 className="display-narrow text-2xl">Fixes, biggest first</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {audit.flags.map((f) => (
                  <li key={f.key} className="border-b border-rule pb-3">
                    <p className="font-bold"><span className={`hl ${TONE[f.severity]}`}>{f.label}</span></p>
                    <p className="text-sm text-ink-2">{f.detail}</p>
                    <p className="mt-1 text-sm">{f.fix}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {audit.rewrites.length > 0 && (
            <div>
              <h2 className="display-narrow text-2xl">Starting points</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {audit.rewrites.map((r) => (
                  <li key={r.section} className="sheet p-3">
                    <p className="label">{r.section === "url" ? "Custom URL" : "Headline"}</p>
                    <p className="mt-1 break-words">{r.text}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-2">Built only from facts in your profile. Add the result you deliver and who you help before you use the headline.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
