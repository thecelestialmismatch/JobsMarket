// Hero specimen: a fictional CV marked against a fictional advert, the product in one picture.

const CV_LINES: { text: string; id: string; mark?: "match" }[] = [
  { id: "E3", text: "Rebuilt weekly service reporting in SQL and Power BI for 40 team leads.", mark: "match" },
  { id: "E4", text: "Replaced a manual Excel reconciliation with a validated monthly model.", mark: "match" },
  { id: "E5", text: "Presented service trends and staffing risks to the leadership team.", mark: "match" },
  { id: "E6", text: "Trained new starters on the ticketing system and escalation paths." },
];

const REQS: { text: string; mark: "match" | "gap" | "unknown"; note: string }[] = [
  { text: "SQL", mark: "match", note: "E3" },
  { text: "Power BI", mark: "match", note: "E3" },
  { text: "Stakeholder reporting", mark: "match", note: "E5" },
  { text: "Tableau", mark: "gap", note: "no evidence" },
  { text: "Australian citizenship", mark: "unknown", note: "check first" },
];

export function Specimen() {
  return (
    <figure className="sheet relative overflow-hidden" aria-label="Example of a CV scored against a job advert">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <span className="label">Example. Jordan Avery against Reporting Analyst</span>
        <span className="score text-sm">
          <span className="hl hl-match hl-sweep" style={{ ["--delay" as string]: "1.5s" }}>78</span>
          <span className="text-ink-3"> / 100</span>
        </span>
      </div>
      <div className="grid gap-0 sm:grid-cols-[1.35fr_1fr]">
        <div className="border-b border-rule p-4 sm:border-b-0 sm:border-r">
          <p className="label mb-3">From the CV</p>
          <ul className="flex flex-col gap-3 text-[0.94rem] leading-snug">
            {CV_LINES.map((l, i) => (
              <li key={l.id} className="flex gap-3">
                <span className="score mt-0.5 w-6 shrink-0 text-xs text-ink-3">{l.id}</span>
                <span>
                  <span className={l.mark ? "hl hl-match hl-sweep" : ""} style={{ ["--delay" as string]: `${0.25 + i * 0.3}s` }}>
                    {l.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4">
          <p className="label mb-3">The advert asks for</p>
          <ul className="flex flex-col gap-2.5 text-[0.94rem]">
            {REQS.map((r, i) => (
              <li key={r.text} className="flex items-baseline justify-between gap-3">
                <span className={`hl hl-${r.mark} hl-sweep`} style={{ ["--delay" as string]: `${0.4 + i * 0.22}s` }}>
                  {r.text}
                </span>
                <span className="score text-xs text-ink-2">{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="border-t border-rule px-4 py-2 text-sm text-ink-2">
        Green has evidence. Pink has none. Yellow needs you to check before applying.
      </figcaption>
    </figure>
  );
}
