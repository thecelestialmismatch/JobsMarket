import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Redacted, ScoreMark } from "@/components/marks";
import { UploadForm } from "@/components/upload-form";
import { getViewer, previewMatches } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Your matches" };

const REMOTE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite", unknown: "" };

export default async function ResultsPage() {
  const viewer = await getViewer();
  if (viewer.user) redirect("/app/jobs");

  if (!viewer.cv) {
    return (
      <>
        <SiteHeader signedIn={false} />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
          <h1 className="display text-4xl">Upload your CV to see matches</h1>
          <p className="mt-3 text-ink-2">Anonymous uploads expire after seven days. Upload again to score it against today&apos;s roles.</p>
          <div className="mt-8"><UploadForm /></div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const matches = await previewMatches(viewer);
  const name = viewer.cv.contact.name?.split(" ")[0];
  const strong = matches.filter((m) => m.score >= 60).length;

  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <p className="label">{viewer.mode === "memory" ? "Demo data. Fictional employers." : "Live roles"}</p>
        <h1 className="display mt-2 text-3xl sm:text-5xl">
          {name ? `${name}, ` : ""}
          <span className="hl hl-match">{strong}</span> {strong === 1 ? "role fits" : "roles fit"} your CV well.
        </h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Scored across {matches.length} open roles. Employers, links and the steps to raise each score unlock when you create a
          free account. Your upload moves across automatically.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="btn btn-pen">Create a free account to unlock</Link>
          <Link href="/login" className="btn btn-line">Sign in</Link>
        </div>

        <ol className="mt-10 border-t border-ink" aria-label="Matched roles">
          {matches.slice(0, 40).map((m) => (
            <li key={m.jobId} className="grid gap-2 border-b border-rule py-4 sm:grid-cols-[6.5rem_1fr_auto] sm:items-baseline sm:gap-6">
              <ScoreMark score={m.score} band={m.band} />
              <div className="min-w-0">
                <p className="font-bold">{m.title}</p>
                <p className="text-sm text-ink-2">
                  <Redacted label="Employer" w="8.5em" /> <span className="mx-1 text-ink-3">at</span> {m.location || "Location not stated"}
                  {REMOTE[m.remote] ? ` · ${REMOTE[m.remote]}` : ""}
                </p>
                <p className="mt-1 text-sm">{m.explanation}</p>
              </div>
              <p className="label sm:text-right">
                {m.requiredCount ? `${m.matchedCount} of ${m.requiredCount} skills` : "Skills not listed"}
              </p>
            </li>
          ))}
        </ol>
        {matches.length === 0 && (
          <p className="mt-8 text-ink-2">No open roles are loaded yet. Check back after the next job board refresh.</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
