import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { UploadForm } from "@/components/upload-form";
import {
  CHECKED_ON,
  CHECKED_ON_ISO,
  CHOOSE_AIAPPLY,
  CHOOSE_JOBSMARKET,
  FAQ,
  LEDE,
  NOT_AFFILIATED,
  ROWS,
  WHY,
} from "@/lib/compare/aiapply";

const PATH = "/compare/aiapply-alternative";
const TITLE = "AIApply alternative that never applies for you";
const DESCRIPTION =
  "JobsMarket and AIApply compared from AIApply's own website. Fit scores you can audit, drafts tied to your CV, one published price, and you press submit.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | JobsMarket`, description: DESCRIPTION, url: PATH, type: "article" },
};

// FAQ answers are our own static copy, and "<" is escaped so no string can close the script tag.
const faqJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
}).replace(/</g, "\\u003c");

export default function CompareAIApply() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd }} />
      <SiteHeader signedIn={false} />
      <main className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-12 pt-10 lg:pt-16">
          <p className="label">JobsMarket vs AIApply</p>
          <h1 className="display text-[2.4rem] sm:text-5xl">
            An AIApply alternative that <span className="hl hl-match">never applies</span> for you.
          </h1>
          <p className="text-lg text-ink-2">{LEDE}</p>
          <p className="text-sm text-ink-3">
            Checked against aiapply.co on <time dateTime={CHECKED_ON_ISO}>{CHECKED_ON}</time>.
          </p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-14 md:grid-cols-2">
          <div className="sheet flex flex-col gap-3 p-6">
            <h2 className="display-narrow text-2xl">Choose AIApply if</h2>
            <ul className="flex flex-col gap-2 text-ink-2">
              {CHOOSE_AIAPPLY.map((t) => (
                <li key={t} className="border-t border-rule pt-2">{t}</li>
              ))}
            </ul>
          </div>
          <div className="sheet flex flex-col gap-3 border-ink p-6">
            <h2 className="display-narrow text-2xl">Choose JobsMarket if</h2>
            <ul className="flex flex-col gap-2 text-ink-2">
              {CHOOSE_JOBSMARKET.map((t) => (
                <li key={t} className="border-t border-rule pt-2">{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y border-rule bg-sheet">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="display text-3xl sm:text-4xl">Side by side</h2>
            <p className="mt-3 max-w-2xl text-ink-2">
              The yellow mark means AIApply does not publish that detail, so we could not check it.
            </p>
            <table className="mt-8 block w-full text-left sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-ink">
                  <th scope="col" className="label w-44 py-2 pr-4 font-normal">Topic</th>
                  <th scope="col" className="label py-2 pr-4 font-normal">AIApply</th>
                  <th scope="col" className="label py-2 font-normal">JobsMarket</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {ROWS.map((r) => (
                  <tr key={r.topic} className="block border-b border-rule py-4 sm:table-row sm:py-0">
                    <th scope="row" className="block pb-2 font-bold sm:table-cell sm:py-4 sm:pr-4 sm:align-top">
                      {r.topic}
                    </th>
                    <td className="block pb-3 text-ink-2 sm:table-cell sm:py-4 sm:pr-4 sm:align-top">
                      <span className="label mb-1 block sm:hidden">AIApply</span>
                      {r.unpublished ? <span className="hl hl-unknown">{r.aiapply}</span> : r.aiapply}
                    </td>
                    <td className="block sm:table-cell sm:py-4 sm:align-top">
                      <span className="label mb-1 block sm:hidden">JobsMarket</span>
                      {r.jobsmarket}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-14">
          <h2 className="display text-3xl sm:text-4xl">Why JobsMarket will not apply for you</h2>
          {WHY.map((p) => (
            <p key={p} className="text-ink-2">{p}</p>
          ))}
        </section>

        <section className="border-y border-rule bg-sheet">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="flex flex-col gap-3">
              <h2 className="display text-3xl sm:text-4xl">See it on your own CV</h2>
              <p className="text-ink-2">
                Upload once to see your fit score for live roles and how many of each role&apos;s required skills your CV proves. A
                free account shows exactly which requirements are proven and which are not.
              </p>
            </div>
            <UploadForm />
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="display text-3xl sm:text-4xl">Questions people ask</h2>
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
          <p className="mt-10 text-sm text-ink-3">{NOT_AFFILIATED}</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
