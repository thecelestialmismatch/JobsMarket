import type { DraftSentence, Evidence, ParsedCV, PortfolioItem, PortfolioPage } from "@/lib/types";
import { extractSkills, roleFamily } from "@/lib/skills";

// Role specific portfolio: the same evidence ledger, re-ranked for one role family.
// Every line is a verbatim evidence line, so the page can never claim more than the CV does.

const MAX_ITEMS = 6;

function overlap(skills: string[], core: Set<string>): number {
  return skills.filter((s) => core.has(s)).length;
}

function line(e: Evidence): DraftSentence {
  return { text: e.text, evidenceIds: [e.id] };
}

function itemsFor(cv: ParsedCV, core: Set<string>): PortfolioItem[] {
  const byId = new Map(cv.evidence.map((e) => [e.id, e]));
  const projectItems: PortfolioItem[] = cv.projects.map((p) => {
    const ev = p.evidenceIds.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
    const src = ev.some((e) => e.source === "github") ? "github" : "cv";
    return {
      title: p.title,
      lines: ev.map(line),
      skills: [...new Set(ev.flatMap((e) => extractSkills(e.text)))],
      link: ev.find((e) => e.link)?.link,
      source: src,
    };
  });
  const roleItems: PortfolioItem[] = cv.experience.map((x) => {
    const ev = x.evidenceIds
      .map((id) => byId.get(id))
      .filter((e): e is Evidence => Boolean(e))
      .map((e) => ({ e, score: overlap(extractSkills(e.text), core) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.e);
    return {
      title: `${x.title}, ${x.employer}`,
      lines: ev.map(line),
      skills: [...new Set(ev.flatMap((e) => extractSkills(e.text)))],
      source: "cv",
    };
  });
  return [...projectItems, ...roleItems]
    .filter((i) => i.lines.length > 0)
    .map((i, order) => ({ i, order, score: overlap(i.skills, core) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_ITEMS)
    .map((s) => s.i);
}

export function buildPortfolio(
  cv: ParsedCV,
  familyId: string,
  opts: { id: string; slug: string; now: Date; includeEmail?: boolean },
): PortfolioPage {
  const family = roleFamily(familyId);
  if (!family) throw new Error(`Unknown role family ${familyId}`);
  const core = new Set(family.coreSkills);
  const skills = [...cv.skills].sort((a, b) => Number(core.has(b)) - Number(core.has(a))).slice(0, 15);
  const proven = skills.filter((s) => core.has(s)).slice(0, 3);
  const summary = cv.evidence.filter((e) => e.section === "summary").slice(0, 3).map(line);
  const items = itemsFor(cv, core);
  return {
    id: opts.id,
    slug: opts.slug,
    roleFamily: family.id,
    roleLabel: family.label,
    name: cv.contact.name ?? "Candidate",
    headline: proven.length ? `${family.label} | ${proven.join(" | ")}` : family.label,
    about: summary.length ? summary : items[0]?.lines.slice(0, 1) ?? [],
    items,
    skills,
    links: cv.contact.links,
    location: cv.contact.location,
    email: opts.includeEmail ? cv.contact.email : undefined,
    published: false,
    updatedAt: opts.now.toISOString(),
  };
}

export function portfolioSlug(name: string | undefined, familyId: string, suffix: string): string {
  const base = `${name ?? "portfolio"} ${familyId}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
}
