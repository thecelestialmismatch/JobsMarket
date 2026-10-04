import type { CandidatePrefs, JobFeatures, MatchBand, MatchResult, ParsedCV } from "@/lib/types";
import { evaluate, type Evaluation } from "./criteria";
import { listNames, plural } from "./rubric";
import { buildSuggestions } from "./suggestions";

export { RUBRIC } from "./rubric";

const DAY_MS = 86_400_000;

export function band(score: number): MatchBand {
  if (score >= 75) return "strong";
  if (score >= 60) return "good";
  if (score >= 40) return "stretch";
  return "low";
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function utcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS;
}

function timingLabel(postedDaysAgo: number | null, closesInDays: number | null): string {
  const posted =
    postedDaysAgo === null ? "Posting date not stated" : postedDaysAgo === 0 ? "Posted today" : `Posted ${plural(postedDaysAgo, "day")} ago`;
  if (closesInDays === null) return posted;
  const closes =
    closesInDays < 0 ? "closing date has passed" : closesInDays === 0 ? "closes today" : `closes in ${plural(closesInDays, "day")}`;
  return `${posted}, ${closes}`;
}

/** Days since posting and until closing, in whole UTC days. Never part of the score. */
export function timing(job: JobFeatures, now: Date): MatchResult["timing"] {
  const today = utcDay(now.getTime());
  const posted = parseDate(job.postedAt);
  const closes = parseDate(job.closesAt);
  const postedDaysAgo = posted === null ? null : Math.max(0, today - utcDay(posted));
  const closesInDays = closes === null ? null : utcDay(closes) - today;
  return { postedDaysAgo, closesInDays, label: timingLabel(postedDaysAgo, closesInDays) };
}

function skillsSentence(ev: Evaluation): string {
  const matchedReq = ev.required.filter((s) => ev.matchedSkills.includes(s));
  const n = ev.required.length;
  if (!n) {
    const m = ev.nice.filter((s) => ev.matchedSkills.includes(s)).length;
    return `Matches ${m} of ${plural(ev.nice.length, "desirable skill")}.`;
  }
  const m = matchedReq.length;
  if (m === n) return n === 1 ? `Matches the one required skill, ${ev.required[0]}.` : `Matches all ${n} required skills.`;
  if (m === 0) return n === 1 ? `Shows no evidence of the required skill ${ev.required[0]}.` : `Matches none of the ${n} required skills.`;
  return `Matches ${m} of ${n} required skills, including ${listNames(matchedReq.slice(0, 2))}.`;
}

function experienceSentence(ev: Evaluation, minYears: number | null, cvYears: number | null): string | null {
  const c = ev.criteria.find((x) => x.key === "experience");
  if (!c || c.status === "not_applicable" || minYears === null) return null;
  if (minYears <= 0) return "The advert does not require prior experience.";
  if (c.status === "met") return `Experience meets the ${minYears} year minimum.`;
  if (cvYears === null) return "Years of experience could not be confirmed from the CV.";
  return `Experience is below the ${minYears} year minimum.`;
}

/** One or two plain sentences. Built only from skills and criteria, never from the title or company. */
function explain(ev: Evaluation, job: JobFeatures, cv: ParsedCV): string {
  if (ev.criteria.every((c) => c.status === "not_applicable")) return "The advert states too little to score this match.";
  const skills = ev.criteria.find((c) => c.key === "skills");
  const first = skills?.status === "not_applicable" ? skills.note : skillsSentence(ev);
  const role = ev.criteria.find((c) => c.key === "role");
  const second = experienceSentence(ev, job.requirements.minYears, cv.yearsExperience) ?? (role?.status !== "not_applicable" ? role?.note : null);
  return second ? `${first} ${second}` : first;
}

/** Transparent fit score for one job. Eligibility and timing are reported, never scored. */
export function scoreMatch(cv: ParsedCV, job: JobFeatures, prefs?: CandidatePrefs, now: Date = new Date()): MatchResult {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError("scoreMatch needs a valid Date for now");
  const ev = evaluate(cv, job, prefs);
  return {
    jobId: job.id,
    score: ev.score,
    band: band(ev.score),
    criteria: ev.criteria,
    matchedSkills: ev.matchedSkills,
    missingSkills: ev.missingSkills,
    niceMissing: ev.niceMissing,
    eligibility: job.requirements.eligibility.map((b) => ({ ...b })),
    timing: timing(job, now),
    explanation: explain(ev, job, cv),
    suggestions: buildSuggestions(cv, job, prefs, ev),
  };
}

/** Matches sorted by score, then most recently posted. Jobs without a posting date sort last on ties. */
export function rankMatches(cv: ParsedCV, jobs: JobFeatures[], prefs?: CandidatePrefs, now: Date = new Date()): MatchResult[] {
  return jobs
    .map((job) => ({ result: scoreMatch(cv, job, prefs, now), posted: parseDate(job.postedAt) ?? Number.MIN_SAFE_INTEGER }))
    .sort((a, b) => b.result.score - a.result.score || b.posted - a.posted)
    .map((r) => r.result);
}
