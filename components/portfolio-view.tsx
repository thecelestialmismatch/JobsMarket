import type { PortfolioPage } from "@/lib/types";
import { EvidenceTag } from "./marks";

/** Shared by the private preview and the public page. Evidence tags only show to the owner. */
export function PortfolioView({ page, owner }: { page: PortfolioPage; owner: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="label">{page.roleLabel} portfolio</p>
        <h1 className="display text-4xl sm:text-5xl">{page.name}</h1>
        <p className="text-lg text-ink-2">{page.headline}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {page.location && <span>{page.location}</span>}
          {page.email && <a className="link" href={`mailto:${page.email}`}>{page.email}</a>}
          {page.links.map((l) => (
            <a key={l} className="link" href={l.startsWith("http") ? l : `https://${l}`} target="_blank" rel="noopener noreferrer nofollow">
              {l.replace(/^https?:\/\//, "")}
            </a>
          ))}
        </p>
      </header>
      {page.about.length > 0 && (
        <section>
          <p className="max-w-3xl text-lg leading-relaxed">
            {page.about.map((s, i) => <span key={i}>{s.text}{owner && <EvidenceTag ids={s.evidenceIds} />} </span>)}
          </p>
        </section>
      )}
      <section className="grid gap-4 md:grid-cols-2">
        {page.items.map((item, i) => (
          <article key={i} className="sheet flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display-narrow text-xl">{item.title}</h2>
              {item.source === "github" && <span className="label">GitHub</span>}
            </div>
            <ul className="ml-5 flex list-disc flex-col gap-1">
              {item.lines.map((l, j) => <li key={j}>{l.text}{owner && <EvidenceTag ids={l.evidenceIds} />}</li>)}
            </ul>
            {item.skills.length > 0 && (
              <p className="flex flex-wrap gap-2">{item.skills.slice(0, 6).map((s) => <span key={s} className="label hl hl-match">{s}</span>)}</p>
            )}
            {item.link && (
              <a className="link text-sm" href={item.link} target="_blank" rel="noopener noreferrer nofollow">View the code</a>
            )}
          </article>
        ))}
      </section>
      {page.skills.length > 0 && (
        <section>
          <h2 className="label">Skills</h2>
          <p className="mt-2">{page.skills.join(", ")}</p>
        </section>
      )}
    </div>
  );
}
