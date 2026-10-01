import type { Metadata } from "next";
import { marketScan, recruiterAnalysis, skillGaps } from "@/lib/insights";
import { requireCv } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "Market scanner" };

export default async function MarketPage() {
  const ws = await requireCv("/app/market");
  const jobs = await ws.store.listJobs();
  const analysis = recruiterAnalysis(ws.cv, jobs);
  const scan = marketScan(jobs, ws.cv);
  const gaps = skillGaps(ws.cv, jobs);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="label">Market scanner</p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">Where your CV is strongest</h1>
        <p className="mt-2 max-w-2xl text-ink-2">{analysis.headline}</p>
      </div>

      <section>
        <h2 className="display-narrow text-2xl">The 20 titles you are most qualified for</h2>
        <p className="mt-1 text-sm text-ink-2">
          Ranked by how much of each role&apos;s core skill set your CV already evidences. Green keywords are on your CV, pink are what
          screening tools for that title look for and cannot find.
        </p>
        <ol className="mt-4 border-t border-ink">
          {analysis.titles.map((t, i) => (
            <li key={`${t.title}-${i}`} className="grid gap-2 border-b border-rule py-3 sm:grid-cols-[3rem_1fr_6rem] sm:gap-4">
              <span className="score text-xl">{t.score}</span>
              <div>
                <p className="font-bold">
                  {t.title} <span className="font-normal text-ink-2">· {t.openJobs} open now</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm">
                  {t.haveKeywords.slice(0, 8).map((k) => <span key={k} className="hl hl-match">{k}</span>)}
                  {t.missingKeywords.slice(0, 6).map((k) => <span key={k} className="hl hl-gap">{k}</span>)}
                </p>
              </div>
              <span className="label sm:text-right">{i + 1} of 20</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="display-narrow text-2xl">Skills that would move you most</h2>
          <p className="mt-1 text-sm text-ink-2">Across your 25 closest roles. Points are the average score gain if your CV showed real evidence.</p>
          <ol className="mt-3 flex flex-col gap-3">
            {gaps.map((g) => (
              <li key={g.skill} className="sheet p-4">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-bold"><span className="hl hl-gap">{g.skill}</span></span>
                  <span className="score">+{g.scoreGain}</span>
                </p>
                <p className="text-sm text-ink-2">Asked for in {pct(g.demandShare)} of those roles.</p>
                <p className="mt-1 text-sm">{g.learn}</p>
              </li>
            ))}
            {gaps.length === 0 && <li className="text-ink-2">No recurring gaps in your closest roles.</li>}
          </ol>
        </div>
        <div>
          <h2 className="display-narrow text-2xl">Most requested skills</h2>
          <p className="mt-1 text-sm text-ink-2">Across all {scan.totalOpen} open roles.</p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {scan.skillDemand.slice(0, 15).map((s) => (
                <tr key={s.skill} className="border-b border-rule">
                  <td className="py-2"><span className={`hl ${s.youHave ? "hl-match" : "hl-gap"}`}>{s.skill}</span></td>
                  <td className="w-1/2 py-2">
                    <span className="block h-2 rounded-sm bg-ink-3" style={{ width: pct(s.share) }} aria-hidden />
                  </td>
                  <td className="score py-2 text-right">{pct(s.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="display-narrow text-2xl">Advertised pay</h2>
          <p className="mt-1 text-sm text-ink-2">Only where three or more roles in a family publish a range, normalised to a year.</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th className="label py-2 text-left font-normal">Role family</th>
                <th className="label py-2 text-right font-normal">Low</th>
                <th className="label py-2 text-right font-normal">Median</th>
                <th className="label py-2 text-right font-normal">High</th>
              </tr>
            </thead>
            <tbody>
              {scan.salaryBands.map((b) => (
                <tr key={`${b.roleFamily}-${b.currency}`} className="border-b border-rule">
                  <td className="py-2">{b.roleFamily} <span className="text-ink-3">({b.n})</span></td>
                  {[b.min, b.median, b.max].map((n, i) => (
                    <td key={i} className="score py-2 text-right">{b.currency} {Math.round(n / 1000)}k</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {scan.salaryBands.length === 0 && <p className="mt-3 text-sm text-ink-2">Not enough published pay ranges yet.</p>}
        </div>
        <div>
          <h2 className="display-narrow text-2xl">Eligibility and sources</h2>
          <p className="mt-3">
            <span className="hl hl-unknown">{pct(scan.eligibilityShare)}</span> of open roles state a citizenship, work rights, clearance or
            licence requirement.
          </p>
          <ul className="mt-4 flex flex-col gap-1 text-sm">
            {scan.sources.map((s) => (
              <li key={s.source} className="flex justify-between border-b border-rule py-1">
                <span>{s.source}</span>
                <span className="score">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
