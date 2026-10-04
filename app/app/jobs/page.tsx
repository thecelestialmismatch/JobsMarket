import type { Metadata } from "next";
import Link from "next/link";
import { ScoreMark } from "@/components/marks";
import { ago, REMOTE_LABEL, sourceLabel } from "@/lib/format";
import { fullMatches } from "@/lib/server/viewer";
import { requireCv } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "Job finder" };

const HOUR = 3_600_000;

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const ws = await requireCv("/app/jobs");
  const sp = await searchParams;
  const min = Math.min(100, Math.max(0, Number(sp.min) || 0));
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 60) : "";
  const remoteOnly = sp.remote === "1";
  const newOnly = sp.new === "1";

  const now = new Date();
  const all = await fullMatches(ws, now);
  if (!ws.lastSeenAt || now.getTime() - new Date(ws.lastSeenAt).getTime() > HOUR) await ws.store.markSeen(now.toISOString());

  const rows = all.filter(
    (m) =>
      m.match.score >= min &&
      (!q || `${m.job.title} ${m.job.company}`.toLowerCase().includes(q)) &&
      (!remoteOnly || m.job.remote === "remote") &&
      (!newOnly || m.isNew),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label">Job finder</p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">{rows.length} open roles</h1>
        <p className="mt-2 text-ink-2">
          Pulled from employers&apos; own job boards. Each row shows where it came from and when we last confirmed it was still listed.
        </p>
      </div>

      <form className="sheet grid gap-3 p-4 sm:grid-cols-[1fr_9rem_auto_auto_auto] sm:items-end" role="search">
        <label className="flex flex-col gap-1">
          <span className="label">Title or employer</span>
          <input name="q" defaultValue={q} className="field" placeholder="analyst" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Minimum score</span>
          <select name="min" defaultValue={String(min)} className="field">
            {[0, 40, 60, 75].map((n) => (
              <option key={n} value={n}>{n === 0 ? "Any" : `${n} and up`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm">
          <input type="checkbox" name="remote" value="1" defaultChecked={remoteOnly} /> Remote only
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm">
          <input type="checkbox" name="new" value="1" defaultChecked={newOnly} /> New since last visit
        </label>
        <button className="btn btn-line" type="submit">Filter</button>
      </form>

      <ol className="border-t border-ink">
        {rows.map((m) => (
          <li key={m.job.id} className="border-b border-rule">
            <Link
              href={`/app/jobs/${encodeURIComponent(m.job.id)}`}
              className="grid gap-2 py-4 hover:bg-sheet sm:grid-cols-[6.5rem_1fr_11rem] sm:gap-6"
            >
              <ScoreMark score={m.match.score} band={m.match.band} />
              <span className="min-w-0">
                <span className="font-bold">{m.job.title}</span>
                {m.isNew && <span className="label hl hl-unknown ml-2">New</span>}
                {m.match.eligibility.length > 0 && <span className="label hl hl-unknown ml-2">Check eligibility</span>}
                <span className="block text-ink-2">
                  {m.job.company} · {m.job.location || "Location not stated"} · {REMOTE_LABEL[m.job.remote]}
                </span>
                <span className="block text-sm">{m.match.explanation}</span>
              </span>
              <span className="label sm:text-right">
                {sourceLabel(m.job.source)}
                <br />
                checked {ago(m.job.lastCheckedAt, now)}
                <br />
                {m.match.timing.label}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {rows.length === 0 && <p className="text-ink-2">No roles match these filters. Lower the minimum score or clear the search.</p>}
    </div>
  );
}
