import { extractSkills } from "@/lib/skills";
import type { JobPosting, JobRequirements } from "@/lib/types";
import { detectRemote, inferCountry } from "./location";
import { type ParsedSalary, currencyForCountry, parseSalary, salaryFromDescription } from "./salary";
import type { RawJob } from "./sources/common";
import { cleanTitle } from "./title";

export { cleanTitle };

export type Analyze = (input: { title: string; description: string }) => JobRequirements;

export interface NormalizeDeps {
  now: Date;
  analyze: Analyze;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function jobId(source: string, board: string, sourceId: string): string {
  return slugify(`${source}-${board}-${sourceId}`);
}

function countryOf(raw: RawJob): string | undefined {
  const hint = raw.countryHint?.trim();
  if (hint && /^[A-Za-z]{2}$/.test(hint)) return hint.toUpperCase() === "UK" ? "GB" : hint.toUpperCase();
  return inferCountry(hint) ?? inferCountry(raw.location);
}

type SalaryFields = Pick<JobPosting, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">;

function salaryOf(raw: RawJob, country: string | undefined): SalaryFields {
  const local = currencyForCountry(country);
  const s = raw.salary;
  if (s && (s.min || s.max)) {
    return { salaryMin: s.min ?? s.max, salaryMax: s.max ?? s.min, salaryCurrency: s.currency ?? local, salaryPeriod: s.period };
  }
  // ponytail: a bare "$" with no inferable country is read as USD, the common case on global boards.
  const fallback = local ?? "USD";
  const parsed: ParsedSalary | null =
    (raw.salaryText ? parseSalary(raw.salaryText, fallback) : null) ?? salaryFromDescription(raw.description, fallback);
  if (!parsed) return {};
  return { salaryMin: parsed.min, salaryMax: parsed.max, salaryCurrency: parsed.currency, salaryPeriod: parsed.period };
}

function dropUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function normalizeJob(raw: RawJob, deps: NormalizeDeps): JobPosting {
  const company = raw.company?.trim() || raw.board;
  const title = cleanTitle(raw.title, company);
  const description = raw.description.trim();
  const country = countryOf(raw);
  const now = deps.now.toISOString();
  return dropUndefined({
    id: jobId(raw.source, raw.board, raw.sourceId),
    source: raw.source,
    sourceId: raw.sourceId,
    board: raw.board,
    company,
    title,
    location: raw.location,
    country,
    remote: detectRemote({ workplace: raw.workplace, isRemote: raw.isRemote, title: raw.title, location: raw.location }),
    employmentType: raw.employmentType,
    description,
    url: raw.url,
    applyUrl: raw.applyUrl,
    ...salaryOf(raw, country),
    postedAt: raw.postedAt,
    closesAt: raw.closesAt,
    retrievedAt: now,
    lastCheckedAt: now,
    status: "open" as const,
    skills: extractSkills(`${title}\n${description}`),
    requirements: deps.analyze({ title, description }),
  });
}
