import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildKitButton } from "@/components/build-kit-button";
import { EvidenceTag, ScoreMark, StatusMark } from "@/components/marks";
import { ago, REMOTE_LABEL, salaryLabel, sourceLabel } from "@/lib/format";
import { scoreMatch } from "@/lib/match";
import { monthStart, PLANS } from "@/lib/plans";
import { requireCv } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "Fit checker" };

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const ws = await requireCv(`/app/jobs/${id}`);
  const job = await ws.store.getJob(decodeURIComponent(id));
  if (!job) notFound();

  const now = new Date();
  const match = scoreMatch(ws.cv, job, ws.prefs, now);
  const [plan, used] = await Promise.all([ws.store.getPlan(), ws.store.countUsage("kit", monthStart(now))]);
  const evidence = new Map(ws.cv.evidence.map((e) => [e.id, e.text]));
  const salary = salaryLabel(job);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link href="/app/jobs" className="btn btn-quiet -ml-1">Back to roles</Link>
          <h1 className="display mt-1 text-3xl sm:text-4xl">{job.title}</h1>
          <p className="mt-2 text-lg">{job.company}</p>
          <p className="text-ink-2">
            {job.location || "Location not stated"} · {REMOTE_LABEL[job.remote]}
            {salary ? ` · ${salary}` : ""}
          </p>
          <p className="label mt-2">
            Source {sourceLabel(job.source)} · first seen {ago(job.retrievedAt, now)} · last confirmed open {ago(job.lastCheckedAt, now)}
            {job.status !== "open" ? " · closed" : ""}
          </p>
        </div>
        <div className="sheet flex w-full flex-col gap-4 p-4 lg:w-80">
          <ScoreMark score={match.score} band={match.band} size="lg" />
          <p className="text-sm">{match.explanation}</p>
          <BuildKitButton jobId={job.id} remaining={Math.max(0, PLANS[plan].limits.kit - used)} />
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-line">
            Open the employer&apos;s posting
          </a>
        </div>
      </header>

      {match.eligibility.length > 0 && (
        <section className="sheet border-l-4 p-4" style={{ borderLeftColor: "var(--hl-unknown)" }}>
          <h2 className="display-narrow text-xl">Check before applying</h2>
          <p className="text-sm text-ink-2">These are not scored. Confirm you meet them, because employers usually screen on them first.</p>
          <ul className="mt-2 flex flex-col gap-1">
            {match.eligibility.map((e) => (
              <li key={e.kind} className="text-sm"><span className="hl hl-unknown">{e.text}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="display-narrow text-2xl">How the score was built</h2>
        <p className="mt-1 text-sm text-ink-2">
          Criteria the advert does not mention are left out and the rest are rescaled. Timing never changes the score. {match.timing.label}.
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="label py-2 font-normal">Criterion</th>
              <th className="label py-2 font-normal">Result</th>
              <th className="label py-2 text-right font-normal">Points</th>
            </tr>
          </thead>
          <tbody>
            {match.criteria.map((c) => (
              <tr key={c.key} className="border-b border-rule align-top">
                <td className="py-3 pr-4">
                  <span className="font-bold">{c.label}</span>
                  <span className="block text-ink-2">
                    {c.note}
                    <EvidenceTag ids={c.evidenceIds.slice(0, 3)} />
                  </span>
                </td>
                <td className="py-3 pr-4"><StatusMark status={c.status} /></td>
                <td className="score py-3 text-right">
                  {c.status === "not_applicable" ? "n/a" : `${Math.round(c.earned)}/${c.weight}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="display-narrow text-xl">Skills with evidence</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {match.matchedSkills.map((s) => (
              <li key={s} className="hl hl-match text-sm">{s}</li>
            ))}
            {match.matchedSkills.length === 0 && <li className="text-sm text-ink-2">None of the listed skills appear in your CV.</li>}
          </ul>
        </div>
        <div>
          <h2 className="display-narrow text-xl">Skills with no evidence</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {[...match.missingSkills, ...match.niceMissing].map((s) => (
              <li key={s} className="hl hl-gap text-sm">{s}</li>
            ))}
            {match.missingSkills.length + match.niceMissing.length === 0 && <li className="text-sm text-ink-2">No gaps against the listed skills.</li>}
          </ul>
        </div>
      </section>

      {match.suggestions.length > 0 && (
        <section>
          <h2 className="display-narrow text-2xl">Steps that would raise this score</h2>
          <p className="mt-1 text-sm text-ink-2">Only act on these if they are true. The points are what the rubric would add.</p>
          <ol className="mt-3 flex flex-col gap-2">
            {match.suggestions.map((s) => (
              <li key={s.action} className="flex items-baseline gap-4 border-b border-rule pb-2">
                <span className="score w-10 shrink-0 text-right">+{s.gain}</span>
                <span>{s.action}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="display-narrow text-2xl">The advert</h2>
        <div className="sheet mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap p-5 text-sm leading-relaxed">{job.description}</div>
      </section>

      <details className="text-sm text-ink-2">
        <summary className="cursor-pointer">Your CV lines cited above</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {[...new Set(match.criteria.flatMap((c) => c.evidenceIds))].map((eid) => (
            <li key={eid}><span className="score mr-2">{eid}</span>{evidence.get(eid)}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
