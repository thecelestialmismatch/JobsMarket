// A starting draft for the filler from the CV already on file. Every line comes from the CV as written,
// so the user edits facts they already own instead of text the app invented.
import type { ParsedCV } from "@/lib/types";
import type { FillInput } from "./plan";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "present") return "Present";
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!m) return undefined;
  const month = m[2] ? MONTHS[Number(m[2]) - 1] : undefined;
  return month ? `${month} ${m[1]}` : m[1];
}

function range(start?: string, end?: string): string | undefined {
  const from = monthYear(start);
  const to = monthYear(end);
  return from && to ? `${from} to ${to}` : from ?? to;
}

export function draftFromCv(cv: ParsedCV): FillInput {
  const byId = new Map(cv.evidence.map((e) => [e.id, e.text]));
  const bullets = (ids: readonly string[], skip?: string) =>
    ids
      .map((id) => byId.get(id))
      .filter((t): t is string => Boolean(t) && t !== skip)
      .map((t) => `• ${t}`)
      .join("\n");
  const profile = cv.contact.links.find((l) => /linkedin\.com\/in\//i.test(l));

  return {
    owner: cv.contact.name ?? "",
    profileUrl: profile ?? "",
    ...(cv.summary ? { about: cv.summary } : {}),
    ...(cv.skills.length ? { topSkills: cv.skills.slice(0, 5), skills: cv.skills.slice(0, 100) } : {}),
    positions: cv.experience.map((x) => {
      const dates = range(x.start, x.end);
      return { title: x.title, company: x.employer, ...(dates ? { dates } : {}), description: bullets(x.evidenceIds) };
    }),
    projects: cv.projects.map((p) => ({ name: p.title, description: bullets(p.evidenceIds, p.title) })),
  };
}
