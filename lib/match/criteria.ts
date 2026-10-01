import { classifyTitle, roleFamily } from "@/lib/skills";
import type { CandidatePrefs, Criterion, JobFeatures, ParsedCV } from "@/lib/types";
import { locationCriterion } from "./location";
import { criterion, plural } from "./rubric";

const REQUIRED_SHARE = 0.85;
const RELATED_FAMILY_OVERLAP = 0.4;

export interface Evaluation {
  criteria: Criterion[];
  score: number;
  required: string[];
  nice: string[];
  matchedSkills: string[];
  missingSkills: string[];
  niceMissing: string[];
}

/** Lower case canonical skills the CV evidences, from the skill list or the evidence map. */
export function cvSkillSet(cv: ParsedCV): Set<string> {
  const fromEvidence = Object.entries(cv.skillEvidence)
    .filter(([, ids]) => ids.length > 0)
    .map(([name]) => name);
  return new Set([...cv.skills, ...fromEvidence].map((s) => s.toLowerCase()));
}

function skillsCriterion(cv: ParsedCV, required: string[], nice: string[], have: Set<string>): Criterion {
  if (!required.length && !nice.length) {
    return criterion("skills", "not_applicable", 0, "The advert does not list specific skills.");
  }
  const matchedReq = required.filter((s) => have.has(s.toLowerCase()));
  const matchedNice = nice.filter((s) => have.has(s.toLowerCase()));
  const reqCov = required.length ? matchedReq.length / required.length : 0;
  const niceCov = nice.length ? matchedNice.length / nice.length : 0;
  const share = !nice.length ? reqCov : !required.length ? niceCov : REQUIRED_SHARE * reqCov + (1 - REQUIRED_SHARE) * niceCov;
  const evidenceIds = [...new Set([...matchedReq, ...matchedNice].flatMap((s) => cv.skillEvidence[s] ?? []))];
  const primaryCov = required.length ? reqCov : niceCov;
  const status = share === 0 ? "missing" : primaryCov === 1 ? "met" : "partial";
  return criterion("skills", status, share, skillsNote(required, matchedReq, nice, matchedNice), evidenceIds);
}

function skillsNote(required: string[], matchedReq: string[], nice: string[], matchedNice: string[]): string {
  if (!matchedReq.length && !matchedNice.length) {
    const asked = required.length ? `${plural(required.length, "required skill")}` : plural(nice.length, "desirable skill");
    return `No evidence was found for any of the ${asked}.`;
  }
  const parts: string[] = [];
  if (required.length) parts.push(`Shows ${matchedReq.length} of ${plural(required.length, "required skill")}.`);
  if (nice.length) parts.push(`Shows ${matchedNice.length} of ${plural(nice.length, "desirable skill")}.`);
  return parts.join(" ");
}

function familyOverlap(a: string, b: string): number {
  const fa = roleFamily(a);
  const fb = roleFamily(b);
  if (!fa || !fb || !fb.coreSkills.length) return 0;
  const core = new Set(fa.coreSkills.map((s) => s.toLowerCase()));
  return fb.coreSkills.filter((s) => core.has(s.toLowerCase())).length / fb.coreSkills.length;
}

const TITLE_STOP = new Set([
  "senior", "junior", "lead", "principal", "graduate", "intern", "the", "and", "of", "for", "to", "in", "at",
  "with", "a", "an", "i", "ii", "iii", "iv", "sr", "jr", "snr", "jnr", "mid", "level", "entry", "trainee",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title.toLowerCase().split(/[^a-z0-9+#]+/).filter((t) => t.length > 1 && !TITLE_STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function roleCriterion(cv: ParsedCV, job: JobFeatures): Criterion {
  const family = job.requirements.roleFamily;
  if (!cv.experience.length) {
    return criterion("role", "missing", 0, "No job titles were found in the CV to compare with this role.");
  }
  if (!family) return roleByTitle(cv, job.title);
  const same = cv.experience.filter((e) => classifyTitle(e.title) === family);
  if (same.length) {
    const ids = same.flatMap((e) => e.evidenceIds.slice(0, 1));
    return criterion("role", "met", 1, "A previous role is in the same role family as this advert.", ids);
  }
  const cvFamilies = [...new Set(cv.experience.map((e) => classifyTitle(e.title)).filter((f): f is string => !!f))];
  if (cvFamilies.some((f) => familyOverlap(f, family) >= RELATED_FAMILY_OVERLAP)) {
    return criterion("role", "partial", 0.5, "Previous roles are in a related role family that shares core skills.");
  }
  return criterion("role", "missing", 0, "No previous role is in the same or a related role family.");
}

function roleByTitle(cv: ParsedCV, jobTitle: string): Criterion {
  const target = titleTokens(jobTitle);
  if (!target.size) return criterion("role", "not_applicable", 0, "The advert title gives no role to compare.");
  const best = cv.experience
    .map((e) => ({ e, j: jaccard(target, titleTokens(e.title)) }))
    .reduce((a, b) => (b.j > a.j ? b : a));
  const ids = best.e.evidenceIds.slice(0, 1);
  if (best.j >= 0.5) return criterion("role", "met", 1, "A previous job title closely matches this role.", ids);
  if (best.j >= 0.25) return criterion("role", "partial", 0.5, "A previous job title partly matches this role.", ids);
  return criterion("role", "missing", 0, "No previous job title matches this role.");
}

export function formatYears(years: number): string {
  const rounded = Math.round(years * 10) / 10;
  return `${rounded} year${rounded === 1 ? "" : "s"}`;
}

function experienceCriterion(cv: ParsedCV, minYears: number | null): Criterion {
  if (minYears === null) {
    return criterion("experience", "not_applicable", 0, "The advert does not state a minimum number of years.");
  }
  if (minYears <= 0) return criterion("experience", "met", 1, "The advert does not require prior experience.");
  const years = cv.yearsExperience;
  if (years === null || !Number.isFinite(years)) {
    return criterion("experience", "missing", 0, "No evidence was found for years of experience because no roles are dated.");
  }
  const share = Math.min(1, Math.max(0, years) / minYears);
  const ids = cv.experience.filter((e) => e.start).flatMap((e) => e.evidenceIds.slice(0, 1));
  const note = `Shows about ${formatYears(years)} of experience against the ${minYears} year minimum.`;
  const status = share >= 1 ? "met" : share > 0 ? "partial" : "missing";
  return criterion("experience", status, share, note, ids);
}

const DEGREE_NEED: Record<string, number> = { bachelor: 2, master: 3, phd: 4 };

export function qualificationRank(qualification: string): number {
  const q = qualification.toLowerCase();
  if (/\bph\.?\s?d\b|\bdoctor(?:ate| of)\b/.test(q)) return 4;
  if (/\bmaster|\bm\.?sc\b|\bmba\b|\bm\.?eng\b|\bmphil\b|\bmres\b|\bllm\b/.test(q)) return 3;
  if (/\bbachelor|\bb\.?sc\b|\bb\.?a\b|\bb\.?eng\b|\bb\.?com\b|\bbbus\b|\bllb\b|\bhonours\b|\bundergraduate\b|\bdegree\b/.test(q)) return 2;
  if (/diploma|certificate|\bassociate\b|\bcert\b|\btafe\b/.test(q)) return 1;
  return 0;
}

function educationCriterion(cv: ParsedCV, degree: JobFeatures["requirements"]["degree"]): Criterion {
  if (!degree || degree === "none") {
    return criterion("education", "not_applicable", 0, "The advert does not ask for a degree.");
  }
  if (!cv.education.length) {
    return criterion("education", "missing", 0, "No evidence was found for a qualification because the CV lists no education.");
  }
  const best = cv.education
    .map((e) => ({ e, rank: qualificationRank(e.qualification) }))
    .reduce((a, b) => (b.rank > a.rank ? b : a));
  const ids = best.e.evidenceId ? [best.e.evidenceId] : [];
  const need = DEGREE_NEED[degree];
  if (best.rank >= need) return criterion("education", "met", 1, `Holds a qualification at ${degree} level or above.`, ids);
  if (best.rank > 0) {
    return criterion("education", "partial", 0.5, `Holds a qualification below the ${degree} level the advert asks for.`, ids);
  }
  return criterion("education", "missing", 0, `No evidence was found for a qualification at ${degree} level.`);
}

function jobSkills(job: JobFeatures): { required: string[]; nice: string[] } {
  const { requiredSkills, niceSkills } = job.requirements;
  if (requiredSkills.length || niceSkills.length) return { required: requiredSkills, nice: niceSkills };
  return { required: job.skills, nice: [] };
}

/** Score renormalised over the criteria that apply, from the rounded earned points shown to users. */
export function totalScore(criteria: Criterion[]): number {
  const applicable = criteria.filter((c) => c.status !== "not_applicable");
  const weight = applicable.reduce((sum, c) => sum + c.weight, 0);
  if (!weight) return 0;
  const earned = applicable.reduce((sum, c) => sum + c.earned, 0);
  return Math.max(0, Math.min(100, Math.round((100 * earned) / weight)));
}

/** The scored part of a match, without explanation, timing or suggestions. */
export function evaluate(cv: ParsedCV, job: JobFeatures, prefs?: CandidatePrefs): Evaluation {
  const { required, nice } = jobSkills(job);
  const have = cvSkillSet(cv);
  const criteria = [
    skillsCriterion(cv, required, nice, have),
    roleCriterion(cv, job),
    experienceCriterion(cv, job.requirements.minYears),
    locationCriterion(cv, job, prefs),
    educationCriterion(cv, job.requirements.degree),
  ];
  const matched = [...required, ...nice].filter((s) => have.has(s.toLowerCase()));
  return {
    criteria,
    score: totalScore(criteria),
    required,
    nice,
    matchedSkills: [...new Set(matched)],
    missingSkills: required.filter((s) => !have.has(s.toLowerCase())),
    niceMissing: nice.filter((s) => !have.has(s.toLowerCase())),
  };
}
