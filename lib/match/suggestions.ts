import { learnHint } from "@/lib/skills";
import type { CandidatePrefs, JobFeatures, ParsedCV, Suggestion } from "@/lib/types";
import { evaluate, type Evaluation } from "./criteria";
import { plural } from "./rubric";

const MAX_SUGGESTIONS = 6;
const LEARN_TOP = 2;
// Only ever used to re-score a hypothetical CV, never returned to callers.
const HYPOTHETICAL_ID = "HYPOTHETICAL";

/** A copy of the CV in which the skill is evidenced, used to measure what honest evidence would add. */
export function withSkill(cv: ParsedCV, skill: string): ParsedCV {
  return {
    ...cv,
    skills: [...cv.skills, skill],
    skillEvidence: { ...cv.skillEvidence, [skill]: [HYPOTHETICAL_ID] },
  };
}

type Rescore = (next: ParsedCV) => number;

function skillSuggestions(cv: ParsedCV, base: Evaluation, rescore: Rescore): Suggestion[] {
  const gains = base.missingSkills
    .map((skill) => ({ skill, gain: rescore(withSkill(cv, skill)) }))
    .filter((g) => g.gain > 0);
  const evidence = gains.map(({ skill, gain }): Suggestion => ({
    kind: "add_evidence",
    action: `If you have used ${skill} in a role, add a bullet that shows where and what it achieved.`,
    gain,
  }));
  const learn = [...gains]
    .sort((a, b) => b.gain - a.gain)
    .slice(0, LEARN_TOP)
    .map(({ skill, gain }): Suggestion => ({ kind: "learn", action: learnHint(skill), gain }));
  return [...evidence, ...learn];
}

// Clarify gains are ceilings: the real gain depends on facts only the candidate knows,
// so the action text says "up to" and names the assumption.
function clarifySuggestions(cv: ParsedCV, job: JobFeatures, prefs: CandidatePrefs | undefined, base: Evaluation, rescore: Rescore): Suggestion[] {
  const out: Suggestion[] = [];
  const location = base.criteria.find((c) => c.key === "location");
  const statedLocation = prefs?.location?.trim() || prefs?.country?.trim() || cv.contact.location?.trim();
  if (location?.status === "missing" && !statedLocation) {
    const gain = rescore({ ...cv, contact: { ...cv.contact, location: job.location } });
    out.push({
      kind: "clarify",
      action: `State your city and country on the CV. If you are based near this role, location can add up to ${plural(gain, "point")}.`,
      gain,
    });
  }
  const minYears = job.requirements.minYears;
  const undated = cv.yearsExperience === null || cv.experience.some((e) => !e.start);
  if (undated && minYears !== null && minYears > 0) {
    const gain = rescore({ ...cv, yearsExperience: Math.max(cv.yearsExperience ?? 0, minYears) });
    const upside = gain > 0 ? ` If your roles cover the ${minYears} year minimum, experience can add up to ${plural(gain, "point")}.` : "";
    out.push({ kind: "clarify", action: `Add a start and end month and year to every role so experience can be counted.${upside}`, gain });
  }
  return out;
}

/** Up to six honest next steps, each gain measured by re-scoring a changed copy of the CV. */
export function buildSuggestions(cv: ParsedCV, job: JobFeatures, prefs: CandidatePrefs | undefined, base: Evaluation): Suggestion[] {
  const rescore: Rescore = (next) => evaluate(next, job, prefs).score - base.score;
  return [...skillSuggestions(cv, base, rescore), ...clarifySuggestions(cv, job, prefs, base, rescore)]
    .sort((a, b) => b.gain - a.gain)
    .slice(0, MAX_SUGGESTIONS);
}
