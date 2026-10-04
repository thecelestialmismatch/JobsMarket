import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Specimen } from "@/components/specimen";
import { UploadForm } from "@/components/upload-form";
import { EvidenceTag } from "@/components/marks";
import { PLANS } from "@/lib/plans";
import { signedInSafe } from "@/lib/server/safe";

const MODULES: { name: string; does: string }[] = [
  { name: "Job finder", does: "Live roles from employers' own job boards, each with when we last confirmed it was open." },
  { name: "Fit checker", does: "A score you can audit. Every point links to a line in your CV or says plainly that none exists." },
  { name: "Resume audit", does: "The ten second checks a recruiter runs, with each weak bullet rebuilt as a result statement." },
  { name: "Market scanner", does: "The twenty titles you are most qualified for, the keywords their screening tools look for, and pay bands." },
  { name: "Application writer", does: "A tailored CV, cover letter, outreach note and interview prep for the roles you choose." },
  { name: "Portfolio", does: "A role specific page built from your projects and public GitHub work, private until you publish it." },
  { name: "Tracker", does: "Every application, follow up date and interview in one list, with response and interview rates." },
];

const LETTER: { text: string; ids: string[] }[] = [
  { text: "I am applying for the Reporting Analyst role at Quillfeather Analytics.", ids: ["JOB"] },
  { text: "At Northwind Telecom, I rebuilt weekly service reporting in SQL and Power BI for 40 team leads.", ids: ["E3"] },
  { text: "I also replaced a manual Excel reconciliation with a validated monthly model.", ids: ["E4"] },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does JobsMarket apply to jobs for me?",
    a: "No. It drafts, you review, and you apply on the employer's own site. Mass automated applications break most job boards' terms and rarely get read.",
  },
  {
    q: "Will it make things up to raise my score?",
    a: "No. Generated sentences can only use lines from your CV, and a fact check rejects any number, employer or skill your CV does not contain. If a requirement has no evidence, the score says so.",
  },
  {
    q: "Where do the jobs come from?",
    a: "Public job board feeds that employers publish themselves, such as Greenhouse, Lever and Ashby, plus Remotive for remote roles. We do not scrape LinkedIn or SEEK. Closed roles are removed when the employer takes them down.",
  },
  {
    q: "What happens to my CV?",
    a: "We read the file in memory, keep the extracted text and discard the file. Anonymous uploads expire after seven days. You can delete everything from settings at any time.",
  },
];

export default async function Home() {
  const signedIn = await signedInSafe();
  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:pt-16">
          <div className="flex flex-col gap-6">
            <p className="label">For people applying to real jobs, one at a time, properly</p>
            <h1 className="display text-[2.6rem] sm:text-6xl">
              See your CV the way a <span className="hl hl-unknown">recruiter</span> reads it.
            </h1>
            <p className="max-w-xl text-lg text-ink-2">
              Upload once. We score it against live roles, show which requirements your CV proves and which it does not, and draft
              applications where every sentence points back to something you actually wrote.
            </p>
            <UploadForm />
          </div>
          <div className="lg:pt-10">
            <Specimen />
          </div>
        </section>

        <section className="border-y border-rule bg-sheet">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="display-narrow text-2xl">
              Applications submitted by JobsMarket <span className="score hl hl-match">0</span>
            </p>
            <p className="max-w-xl text-ink-2">
              That number will always be zero. You stay the author of every application, which is also why recruiters read them.
            </p>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="display text-3xl sm:text-4xl">What is in the workspace</h2>
          <dl className="mt-8 grid gap-x-10 border-t border-rule sm:grid-cols-2">
            {MODULES.map((m) => (
              <div key={m.name} className="flex flex-col gap-1 border-b border-rule py-5">
                <dt className="display-narrow text-xl">{m.name}</dt>
                <dd className="text-ink-2">{m.does}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="display text-3xl sm:text-4xl">Every sentence has a receipt.</h2>
            <p className="text-ink-2">
              The tag after each sentence is the CV line it came from. Before anything reaches you it passes a style check (no
              filler phrases, no dashes or semicolons, nothing that reads as machine written) and a fact check against your CV.
              Anything that fails is rewritten or removed.
            </p>
            <p className="text-ink-2">CVs are exported as plain single column Word files that screening software parses cleanly.</p>
          </div>
          <div className="sheet p-5 sm:p-6">
            <p className="label mb-4">Cover letter, opening paragraph</p>
            <p className="text-[1.05rem] leading-relaxed">
              {LETTER.map((s) => (
                <span key={s.text}>
                  {s.text}
                  <EvidenceTag ids={s.ids} />{" "}
                </span>
              ))}
            </p>
          </div>
        </section>

        <section className="border-t border-rule bg-sheet">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="display text-3xl sm:text-4xl">The scoring rubric is public</h2>
            <p className="mt-3 max-w-2xl text-ink-2">
              A requirement the advert does not mention is left out of the score rather than guessed. A requirement your CV has no
              evidence for earns nothing and stays on screen. Work rights and clearances are flagged for you to check, never scored.
            </p>
            <table className="mt-8 w-full max-w-2xl text-left">
              <thead>
                <tr className="border-b border-ink">
                  <th className="label py-2 font-normal">Criterion</th>
                  <th className="label py-2 text-right font-normal">Weight</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Required and preferred skills", 50],
                  ["Role alignment with your past titles", 20],
                  ["Years of experience against the stated minimum", 15],
                  ["Location and work arrangement", 10],
                  ["Qualifications", 5],
                ].map(([k, w]) => (
                  <tr key={k} className="border-b border-rule">
                    <td className="py-3">{k}</td>
                    <td className="score py-3 text-right">{w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="display text-3xl sm:text-4xl">Pricing</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {Object.values(PLANS).map((p) => (
              <div key={p.id} className={`sheet flex flex-col gap-4 p-6 ${p.id === "pro" ? "border-ink" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="display-narrow text-2xl">{p.label}</h3>
                  <span className="score text-xl">{p.price}</span>
                </div>
                <ul className="flex flex-col gap-2 text-ink-2">
                  {p.features.map((f) => (
                    <li key={f} className="border-t border-rule pt-2">{f}</li>
                  ))}
                </ul>
                <Link href={p.id === "pro" ? "/signup?plan=pro" : "/signup"} className={`btn mt-auto ${p.id === "pro" ? "btn-pen" : "btn-line"}`}>
                  {p.id === "pro" ? "Start with Pro" : "Create a free account"}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20">
          <h2 className="display text-3xl sm:text-4xl">Straight answers</h2>
          <div className="mt-6 border-t border-rule">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-rule py-4">
                <summary className="cursor-pointer list-none font-bold marker:hidden">
                  <span className="mr-2 inline-block text-ink-3 transition-transform group-open:rotate-90">›</span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-5 text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
