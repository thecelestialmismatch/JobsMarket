// Text helpers shared by the lint, fact check and generators.

import type { EvidenceId, JobPosting, ParsedCV } from "@/lib/types";

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /\S+@\S+\.[A-Za-z]{2,}\S*/g;
const PHONE_RE = /\+?\d[\d ()-]{6,}\d/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
// Digits not glued to a preceding letter or digit, so "S3" and "EC2" are skill names, not figures.
const NUMBER_RE = new RegExp("(?<![A-Za-z0-9.])\\d+(?:[.,]\\d+)*", "g");

export function stripLinks(text: string): string {
  return text.replace(URL_RE, " ").replace(EMAIL_RE, " ");
}

function stripPhones(text: string): string {
  return text.replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 8 ? " " : m));
}

export function stripForColon(text: string): string {
  return stripLinks(text).replace(TIME_RE, " ");
}

/** Normalised numbers in prose ("95,000" becomes "95000"), ignoring links, emails and phone numbers. */
export function numbersIn(text: string): string[] {
  const prose = stripPhones(stripLinks(text));
  return (prose.match(NUMBER_RE) ?? []).map((n) => n.replace(/,(?=\d{3}\b)/g, ""));
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function yearsFloor(cv: ParsedCV): number | null {
  return cv.yearsExperience === null ? null : Math.floor(cv.yearsExperience);
}

type AdvertLike = Pick<JobPosting, "title" | "company" | "description"> &
  Partial<Pick<JobPosting, "location" | "salaryMin" | "salaryMax" | "skills" | "requirements">>;

function cvStrings(cv: ParsedCV): string[] {
  return [
    ...cv.evidence.map((e) => e.text),
    cv.summary ?? "",
    cv.contact.location ?? "",
    ...cv.experience.flatMap((x) => [x.title, x.employer, x.start ?? "", x.end ?? ""]),
    ...cv.education.flatMap((x) => [x.qualification, x.institution, x.start ?? "", x.end ?? ""]),
    ...cv.projects.map((p) => p.title),
    ...cv.certifications,
    ...cv.skills,
  ];
}

function advertStrings(job: AdvertLike): string[] {
  const req = job.requirements;
  return [
    job.title,
    job.company,
    job.description,
    job.location ?? "",
    job.salaryMin === undefined ? "" : String(job.salaryMin),
    job.salaryMax === undefined ? "" : String(job.salaryMax),
    ...(job.skills ?? []),
    ...(req ? [...req.requiredSkills, ...req.niceSkills, req.minYears === null ? "" : String(req.minYears)] : []),
  ];
}

/** Numbers a generated document may use: CV facts, advert facts and the floored years of experience. */
export function allowedNumbers(cv: ParsedCV, job?: AdvertLike): Set<string> {
  const years = yearsFloor(cv);
  const sources = [...cvStrings(cv), ...(job ? advertStrings(job) : []), years === null ? "" : String(years)];
  return new Set(sources.flatMap(numbersIn));
}

export function advertNumbers(job: AdvertLike): Set<string> {
  return new Set(advertStrings(job).flatMap(numbersIn));
}

const BULLET_GLYPHS = /^[\s•·▪◦‣⁃●○■□►▸*>\-–—]+/;
const DASH_BETWEEN_NUMBERS = /(\d)(?:\s*[—–―‒]\s*|\s+-\s+|\s*--\s*)(?=[A-Za-z]{3}\s+\d|\d|[Pp]resent\b|[Cc]urrent\b)/g;
const CONNECTOR_DASH = /\s*[—–―‒]\s*|\s+-\s+|\s*--\s*/g;

function replaceSemicolons(text: string): string {
  return text.replace(/\s*;\s*(and\s+)?(\S)/g, (_m, and: string | undefined, next: string) =>
    /[A-Z]/.test(next) && !and ? `. ${next}` : `, and ${next}`,
  );
}

/**
 * The only transformations allowed on an evidence line: trim, strip bullet glyphs, "&" to "and",
 * connector dashes to a comma (or "to" between numbers), semicolons to ", and" or a sentence split.
 */
export function cleanEvidence(text: string): string {
  const base = text
    .trim()
    .replace(BULLET_GLYPHS, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(DASH_BETWEEN_NUMBERS, "$1 to ")
    .replace(CONNECTOR_DASH, ", ");
  return replaceSemicolons(base)
    .replace(/;/g, ",")
    .replace(/\s*,(\s*,)+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

/** A CV label (title, employer, project name) made safe for prose and headings. */
export function cleanLabel(text: string): string {
  return cleanEvidence(text.replace(/\s*:\s*/g, ", "));
}

/** The core of a job title, dropping suffixes such as " - Contract" or " (12 month)". */
export function coreTitle(title: string): string {
  const core = title.split(/\s[–—-]\s|[:|(]|\s[–—]/)[0].trim();
  return cleanLabel(core || title);
}

export function withPeriod(text: string): string {
  return /[.?]$/.test(text) ? text : `${text}.`;
}

const IRREGULAR_PAST = new Set([
  "led", "built", "ran", "made", "grew", "won", "wrote", "drove", "took", "brought", "cut", "set", "taught",
  "sold", "began", "kept", "held", "met", "found", "gave", "rebuilt", "oversaw", "undertook", "spoke", "chose",
]);
const NOT_PAST = new Set(["need", "seed", "feed", "speed", "breed", "bleed", "embed", "shed", "red", "bed", "bred"]);

export function startsWithPastTense(text: string): boolean {
  const first = (text.match(/^[A-Za-z]+/)?.[0] ?? "").toLowerCase();
  if (IRREGULAR_PAST.has(first)) return true;
  return first.length >= 4 && first.endsWith("ed") && !NOT_PAST.has(first);
}

/** Employer that owns each evidence line, from the evidence itself or the experience entry that cites it. */
export function evidenceEmployers(cv: ParsedCV): Map<EvidenceId, string> {
  const fromEntries = cv.experience.flatMap((x) => x.evidenceIds.map((id) => [id, x.employer] as const));
  const fromEvidence = cv.evidence.filter((e) => e.employer).map((e) => [e.id, e.employer as string] as const);
  return new Map([...fromEntries, ...fromEvidence]);
}

export function formatThousands(n: number): string {
  const [int, frac] = String(n).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
