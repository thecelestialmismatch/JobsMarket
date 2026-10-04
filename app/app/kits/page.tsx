import type { Metadata } from "next";
import Link from "next/link";
import { ago } from "@/lib/format";
import { requireUser } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "Application kits" };

export default async function KitsPage() {
  const ws = await requireUser("/app/kits");
  const kits = await ws.store.listKits();
  const jobs = await Promise.all(kits.slice(0, 50).map((k) => ws.store.getJob(k.jobId)));
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label">Review queue</p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">Application kits</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Drafts wait here until you approve them. Nothing is sent anywhere. Download, adjust if you want, and apply on the employer&apos;s site.
        </p>
      </div>
      {kits.length === 0 ? (
        <div className="sheet p-6">
          <p>No kits yet. Open a role in the job finder and choose Build application kit.</p>
          <Link href="/app/jobs" className="btn btn-pen mt-4">Find a role</Link>
        </div>
      ) : (
        <ol className="border-t border-ink">
          {kits.slice(0, 50).map((k, i) => {
            const errors = k.lint.filter((l) => l.severity === "error").length + k.facts.length;
            return (
              <li key={k.id} className="border-b border-rule">
                <Link href={`/app/kits/${k.id}`} className="grid gap-1 py-4 hover:bg-sheet sm:grid-cols-[1fr_auto] sm:gap-6">
                  <span>
                    <span className="font-bold">{jobs[i]?.title ?? "Role no longer listed"}</span>
                    <span className="text-ink-2">{jobs[i] ? ` at ${jobs[i]!.company}` : ""}</span>
                    <span className="block text-sm text-ink-2">
                      {k.documents.length} documents · written {ago(k.createdAt, now)} · {k.generator === "claude" ? "Claude draft" : "Template draft"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`label hl ${errors ? "hl-gap" : "hl-match"}`}>{errors ? `${errors} checks failed` : "Checks passed"}</span>
                    <span className={`label hl ${k.status === "approved" ? "hl-match" : "hl-unknown"}`}>
                      {k.status === "approved" ? "Approved" : "Awaiting review"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
