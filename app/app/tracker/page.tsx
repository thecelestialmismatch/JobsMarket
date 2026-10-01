import type { Metadata } from "next";
import { TrackerRowForm } from "@/components/tracker-row-form";
import { followUpDue, STATUS_LABEL, STATUS_TONE, trackerStats } from "@/lib/tracker";
import { requireUser } from "@/lib/server/workspace";
import { deleteTrackerAction } from "./actions";

export const metadata: Metadata = { title: "Tracker" };

export default async function TrackerPage() {
  const ws = await requireUser("/app/tracker");
  const rows = await ws.store.listTracker();
  const stats = trackerStats(rows);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Tracker</p>
          <h1 className="display mt-1 text-3xl sm:text-4xl">Applications</h1>
        </div>
        <a href="/api/tracker/export" className="btn btn-line">Export CSV</a>
      </div>

      <dl className="grid gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-4">
        {[
          ["Tracked", String(stats.total)],
          ["Sent", String(stats.applied)],
          ["Response rate", `${stats.responseRate}%`],
          ["Interview rate", `${stats.interviewRate}%`],
        ].map(([k, v]) => (
          <div key={k} className="bg-sheet p-4">
            <dt className="label">{k}</dt>
            <dd className="score text-3xl">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="sheet p-5">
        <h2 className="display-narrow text-xl">Add an application</h2>
        <p className="mb-4 text-sm text-ink-2">For roles you found elsewhere. Kits you build can be added from the kit page.</p>
        <TrackerRowForm />
      </section>

      <ol className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="sheet">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 p-4">
                <span className={`label hl ${STATUS_TONE[r.status] ? `hl-${STATUS_TONE[r.status]}` : ""}`}>{STATUS_LABEL[r.status]}</span>
                <span className="font-bold">{r.role}</span>
                <span className="text-ink-2">{r.company}</span>
                {followUpDue(r, today) && <span className="label hl hl-unknown">Follow up due</span>}
                <span className="label ml-auto">{r.appliedAt ? `Applied ${r.appliedAt}` : "Not sent yet"}</span>
              </summary>
              <div className="border-t border-rule p-4">
                <TrackerRowForm row={r} />
                <form action={deleteTrackerAction} className="mt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn btn-quiet text-sm text-danger">Remove from tracker</button>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ol>
      {rows.length === 0 && <p className="text-ink-2">Nothing tracked yet. Add a role above or from a kit.</p>}
    </div>
  );
}
