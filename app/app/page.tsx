import type { Metadata } from "next";
import Link from "next/link";
import { ScoreMark } from "@/components/marks";
import { auditResume } from "@/lib/audit";
import { monthStart, PLANS } from "@/lib/plans";
import { readDraftCookie } from "@/lib/server/cookies";
import { fullMatches } from "@/lib/server/viewer";
import { requireUser } from "@/lib/server/workspace";
import { claimDraftAction } from "./actions";

export const metadata: Metadata = { title: "Overview" };

export default async function Overview() {
  const ws = await requireUser();
  if (!ws.cv) {
    const pending = await readDraftCookie();
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <h1 className="display text-4xl">Start with your CV</h1>
        <p className="text-ink-2">Everything in the workspace runs from one CV. Upload it once and every module fills in.</p>
        {pending && (
          <form action={claimDraftAction}>
            <button className="btn btn-pen" type="submit">Use the CV I uploaded earlier</button>
          </form>
        )}
        <Link href="/app/upload" className="btn btn-line self-start">Upload a CV</Link>
      </div>
    );
  }

  const now = new Date();
  const [matches, plan, kitsUsed, tracker] = await Promise.all([
    fullMatches(ws, now),
    ws.store.getPlan(),
    ws.store.countUsage("kit", monthStart(now)),
    ws.store.listTracker(),
  ]);
  const audit = auditResume(ws.cv);
  const fresh = matches.filter((m) => m.isNew && m.match.score >= 60);
  const interviews = tracker.filter((r) => r.status === "interview" || r.status === "offer").length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="label">Overview</p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">{ws.cv.contact.name ?? "Your workspace"}</h1>
      </div>

      <dl className="grid gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-4">
        {[
          ["Strong or good fits", String(matches.filter((m) => m.match.score >= 60).length), "/app/jobs?min=60"],
          ["New since last visit", String(fresh.length), "/app/jobs?new=1"],
          ["Resume score", `${audit.score}/10`, "/app/resume"],
          ["Kits left this month", String(Math.max(0, PLANS[plan].limits.kit - kitsUsed)), "/app/kits"],
        ].map(([k, v, href]) => (
          <Link key={k} href={href} className="flex flex-col gap-1 bg-sheet p-4 hover:bg-paper">
            <dt className="label">{k}</dt>
            <dd className="score text-3xl">{v}</dd>
          </Link>
        ))}
      </dl>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="display-narrow text-2xl">Best matches right now</h2>
          <Link href="/app/jobs" className="btn btn-quiet">All roles</Link>
        </div>
        <ol className="mt-3 border-t border-ink">
          {matches.slice(0, 6).map((m) => (
            <li key={m.job.id} className="border-b border-rule">
              <Link href={`/app/jobs/${encodeURIComponent(m.job.id)}`} className="grid gap-1 py-3 hover:bg-sheet sm:grid-cols-[6.5rem_1fr] sm:gap-6">
                <ScoreMark score={m.match.score} band={m.match.band} />
                <span>
                  <span className="font-bold">{m.job.title}</span>
                  <span className="text-ink-2"> at {m.job.company}</span>
                  {m.isNew && <span className="label hl hl-unknown ml-2">New</span>}
                  <span className="block text-sm text-ink-2">{m.match.explanation}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="sheet p-5">
          <h2 className="display-narrow text-xl">Applications</h2>
          <p className="mt-2 text-ink-2">
            {tracker.length} tracked, {interviews} at interview or offer.
          </p>
          <Link href="/app/tracker" className="btn btn-quiet mt-2">Open tracker</Link>
        </div>
        <div className="sheet p-5">
          <h2 className="display-narrow text-xl">
            Submitted by JobsMarket <span className="score hl hl-match">0</span>
          </h2>
          <p className="mt-2 text-ink-2">Every application goes out from you, on the employer&apos;s own site, after you have read it.</p>
        </div>
      </section>
    </div>
  );
}
