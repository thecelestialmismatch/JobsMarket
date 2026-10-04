import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { DocKind } from "@/lib/types";
import { CopyButton } from "@/components/copy-button";
import { EvidenceTag } from "@/components/marks";
import { renderText } from "@/lib/writing/docx";
import { requireUser } from "@/lib/server/workspace";
import { approveKitAction, trackKitAction } from "../actions";

export const metadata: Metadata = { title: "Review kit" };

const DOC_LABEL: Record<DocKind, string> = {
  cv: "Tailored CV",
  cover_letter: "Cover letter",
  portfolio: "Portfolio",
  outreach: "Outreach note",
  linkedin: "LinkedIn profile",
  interview_prep: "Interview prep",
};

export default async function KitPage({ params }: PageProps<"/app/kits/[id]">) {
  const { id } = await params;
  const ws = await requireUser(`/app/kits/${id}`);
  const kit = await ws.store.getKit(id);
  if (!kit) notFound();
  const job = await ws.store.getJob(kit.jobId);
  const evidence = new Map((ws.cv?.evidence ?? []).map((e) => [e.id, e]));
  const cited = [...new Set(kit.documents.flatMap((d) => d.sections.flatMap((s) => s.items.flatMap((i) => i.evidenceIds))))].filter(
    (x) => x !== "JOB",
  );
  const lintErrors = kit.lint.filter((l) => l.severity === "error");

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/app/kits" className="btn btn-quiet -ml-1">All kits</Link>
          <h1 className="display mt-1 text-3xl sm:text-4xl">{job?.title ?? "Application kit"}</h1>
          <p className="text-lg">{job?.company ?? "Role no longer listed"}</p>
          <p className="label mt-2">
            {kit.generator === "claude" ? "Written by Claude, checked against your CV" : "Written from templates and your CV lines"} ·{" "}
            {kit.portfolioReason}
          </p>
        </div>
        <div className="sheet flex w-full flex-col gap-3 p-4 lg:w-80">
          <p className={`label hl self-start ${kit.status === "approved" ? "hl-match" : "hl-unknown"}`}>
            {kit.status === "approved" ? "Approved by you" : "Awaiting your review"}
          </p>
          <form action={approveKitAction}>
            <input type="hidden" name="kitId" value={kit.id} />
            <input type="hidden" name="status" value={kit.status === "approved" ? "draft" : "approved"} />
            <button type="submit" className="btn btn-pen w-full">{kit.status === "approved" ? "Move back to review" : "Approve kit"}</button>
          </form>
          <a href={`/api/kits/${kit.id}/download?doc=all`} className="btn btn-line">Download all as ZIP</a>
          <form action={trackKitAction}>
            <input type="hidden" name="kitId" value={kit.id} />
            <button type="submit" className="btn btn-line w-full">Add to tracker</button>
          </form>
          {job && (
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-quiet">
              Apply on the employer&apos;s site
            </a>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className={`sheet p-4 ${lintErrors.length ? "" : ""}`}>
          <p className="label">Style check</p>
          <p className="mt-1">
            <span className={`hl ${lintErrors.length ? "hl-gap" : "hl-match"}`}>
              {lintErrors.length ? `${lintErrors.length} issues` : "No issues"}
            </span>{" "}
            <span className="text-ink-2">across dashes, semicolons, filler phrases and numbers.</span>
          </p>
          {kit.lint.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
              {kit.lint.slice(0, 8).map((l, i) => <li key={i}>{l.message} ({l.excerpt})</li>)}
            </ul>
          )}
        </div>
        <div className="sheet p-4">
          <p className="label">Fact check</p>
          <p className="mt-1">
            <span className={`hl ${kit.facts.length ? "hl-gap" : "hl-match"}`}>{kit.facts.length ? `${kit.facts.length} issues` : "Every claim traced"}</span>{" "}
            <span className="text-ink-2">to {cited.length} lines of your CV.</span>
          </p>
          {kit.facts.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
              {kit.facts.slice(0, 8).map((f, i) => <li key={i}>{f.problem}</li>)}
            </ul>
          )}
        </div>
      </section>

      <nav aria-label="Documents" className="flex flex-wrap gap-2">
        {kit.documents.map((d) => (
          <a key={d.kind} href={`#${d.kind}`} className="btn btn-line min-h-9 text-sm">{DOC_LABEL[d.kind]}</a>
        ))}
      </nav>

      {kit.documents.map((d) => (
        <section key={d.kind} id={d.kind} className="scroll-mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display-narrow text-2xl">{DOC_LABEL[d.kind]}</h2>
            <span className="flex gap-1">
              <CopyButton text={renderText(d)} />
              <a className="btn btn-quiet text-sm" href={`/api/kits/${kit.id}/download?doc=${d.kind}`}>Word file</a>
            </span>
          </div>
          <div className="sheet mt-3 flex flex-col gap-4 p-5 sm:p-7">
            {d.sections.map((s, si) => (
              <div key={si}>
                {s.heading && <h3 className="label mb-1 text-ink">{s.heading}</h3>}
                {s.meta && <p className="text-sm font-bold">{s.meta}</p>}
                {s.style === "bullets" ? (
                  <ul className="ml-5 list-disc">
                    {s.items.map((it, ii) => (
                      <li key={ii}>{it.text}<EvidenceTag ids={it.evidenceIds} /></li>
                    ))}
                  </ul>
                ) : s.style === "lines" ? (
                  s.items.map((it, ii) => <p key={ii}>{it.text}<EvidenceTag ids={it.evidenceIds} /></p>)
                ) : (
                  <p className="leading-relaxed">
                    {s.items.map((it, ii) => (
                      <span key={ii}>{it.text}<EvidenceTag ids={it.evidenceIds} /> </span>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="display-narrow text-2xl">Source ledger</h2>
        <p className="mt-1 text-sm text-ink-2">Every CV line this kit relies on. If a line is wrong, fix it in your CV and rebuild the kit.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="label w-16 py-2 font-normal">Line</th>
              <th className="label py-2 font-normal">Text</th>
              <th className="label py-2 font-normal">Where</th>
            </tr>
          </thead>
          <tbody>
            {cited.map((cid) => {
              const e = evidence.get(cid);
              return (
                <tr key={cid} className="border-b border-rule align-top">
                  <td className="score py-2">{cid}</td>
                  <td className="py-2 pr-4">{e?.text ?? "Line from an earlier version of your CV"}</td>
                  <td className="py-2 text-ink-2">{e ? (e.source === "github" ? "GitHub" : e.employer ?? e.section) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </article>
  );
}
