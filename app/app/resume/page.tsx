import type { Metadata } from "next";
import Link from "next/link";
import { auditResume } from "@/lib/audit";
import { requireCv } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "Resume audit" };

const TONE = { high: "hl-gap", medium: "hl-unknown", low: "" } as const;

export default async function ResumePage() {
  const ws = await requireCv("/app/resume");
  const audit = auditResume(ws.cv);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label">Resume audit</p>
          <h1 className="display mt-1 text-3xl sm:text-4xl">What a recruiter sees in ten seconds</h1>
        </div>
        <p className="score text-6xl">
          <span className={`hl ${audit.score >= 8 ? "hl-match" : audit.score >= 5 ? "hl-unknown" : "hl-gap"}`}>{audit.score}</span>
          <span className="text-2xl text-ink-3">/10</span>
        </p>
      </div>

      <dl className="grid gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-4">
        {[
          ["Bullets", String(audit.stats.bullets)],
          ["With a measurable result", String(audit.stats.bulletsWithMetrics)],
          ["Words", String(audit.stats.wordCount)],
          ["Estimated pages", String(audit.stats.estPages)],
        ].map(([k, v]) => (
          <div key={k} className="bg-sheet p-4">
            <dt className="label">{k}</dt>
            <dd className="score text-2xl">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="display-narrow text-2xl">Red flags</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {audit.flags.map((f) => (
              <li key={f.key} className="border-b border-rule pb-3">
                <p className="font-bold"><span className={`hl ${TONE[f.severity]}`}>{f.label}</span></p>
                <p className="text-sm text-ink-2">{f.detail}</p>
                <p className="mt-1 text-sm">{f.fix}</p>
              </li>
            ))}
            {audit.flags.length === 0 && <li className="text-ink-2">No red flags found.</li>}
          </ul>
        </div>
        <div>
          <h2 className="display-narrow text-2xl">What would make it a 10</h2>
          <ol className="mt-3 ml-5 flex list-decimal flex-col gap-2">
            {audit.toTen.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </div>
      </section>

      <section>
        <h2 className="display-narrow text-2xl">Bullets to rebuild</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Google&apos;s recruiters suggest the pattern accomplished X, as measured by Y, by doing Z. We never add numbers for you. Fill each
          bracket with a figure you can defend in an interview, then upload the revised CV.
        </p>
        <ol className="mt-4 flex flex-col gap-4">
          {audit.bulletCoach.map((b) => (
            <li key={b.evidenceId} className="sheet grid gap-3 p-4 md:grid-cols-2">
              <div>
                <p className="label">Now · {b.evidenceId}</p>
                <p className="mt-1">{b.original}</p>
                <p className="mt-2 flex flex-wrap gap-2">
                  {b.issues.map((i) => <span key={i} className="label hl hl-gap">{i}</span>)}
                </p>
              </div>
              <div>
                <p className="label">Rebuild as</p>
                <p className="mt-1">{b.xyzTemplate}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/app/upload" className="btn btn-line mt-6">Upload the revised CV</Link>
      </section>
    </div>
  );
}
