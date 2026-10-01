import { ROLE_FAMILIES, type RoleFamily } from "@/lib/skills";
import { cvSkillSet } from "@/lib/match/criteria";
import { plural } from "@/lib/match/rubric";
import type { JobFeatures, ParsedCV, TitleFit } from "@/lib/types";

const MAX_TITLES = 20;
const COVERAGE_POINTS = 85;
const HELD_TITLE_BONUS = 15;
const TOP_JOB_SKILLS = 5;

interface FamilyFit {
  family: RoleFamily;
  score: number;
  atsKeywords: string[];
  haveKeywords: string[];
  missingKeywords: string[];
  openJobs: number;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[-_]+/g, " ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function cvText(cv: ParsedCV): string {
  return normalise(
    [cv.summary ?? "", ...cv.evidence.map((e) => e.text), ...Object.values(cv.rawSections), ...cv.skills].join("\n"),
  );
}

/** True when the CV evidences a skill or keyword, from the skill list or as a whole phrase in its text. */
function cvHas(term: string, skills: Set<string>, text: string): boolean {
  if (skills.has(term.toLowerCase())) return true;
  const re = new RegExp(`(^|[^a-z0-9+#])${escapeRe(normalise(term))}(?=$|[^a-z0-9+#])`);
  return re.test(text);
}

function uniqueCi(terms: string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((t) => {
    const k = t.toLowerCase();
    if (!t.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function openJobsIn(jobs: JobFeatures[], familyId: string): JobFeatures[] {
  return jobs.filter((j) => j.status === "open" && j.requirements.roleFamily === familyId);
}

/** Skills most often requested by the given jobs, most requested first, ties by name. */
function topRequested(jobs: JobFeatures[]): string[] {
  const counts = new Map<string, { skill: string; n: number }>();
  for (const job of jobs) {
    const asked = uniqueCi([...job.requirements.requiredSkills, ...job.requirements.niceSkills, ...job.skills]);
    for (const skill of asked) {
      const k = skill.toLowerCase();
      counts.set(k, { skill: counts.get(k)?.skill ?? skill, n: (counts.get(k)?.n ?? 0) + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.skill.localeCompare(b.skill))
    .map((c) => c.skill);
}

function holdsTitleIn(cv: ParsedCV, family: RoleFamily): boolean {
  const titles = family.titles.map((t) => t.toLowerCase());
  return cv.experience.some((e) => titles.some((t) => e.title.toLowerCase().includes(t)));
}

function familyFit(cv: ParsedCV, family: RoleFamily, jobs: JobFeatures[], skills: Set<string>, text: string): FamilyFit {
  const base = uniqueCi([...family.coreSkills, ...family.keywords]);
  const covered = base.filter((t) => cvHas(t, skills, text)).length;
  const coverage = base.length ? covered / base.length : 0;
  const score = Math.round(COVERAGE_POINTS * coverage + (holdsTitleIn(cv, family) ? HELD_TITLE_BONUS : 0));
  const open = openJobsIn(jobs, family.id);
  const inBase = new Set(base.map((t) => t.toLowerCase()));
  const demanded = topRequested(open).filter((s) => !inBase.has(s.toLowerCase())).slice(0, TOP_JOB_SKILLS);
  const atsKeywords = [...base, ...demanded];
  const haveKeywords = atsKeywords.filter((t) => cvHas(t, skills, text));
  const missingKeywords = atsKeywords.filter((t) => !haveKeywords.includes(t));
  return { family, score: Math.min(100, score), atsKeywords, haveKeywords, missingKeywords, openJobs: open.length };
}

function headline(top: TitleFit | undefined): string {
  if (!top) {
    return "The CV does not show enough skills or job titles to rank roles yet. Add a skills section and dated roles to see where you fit.";
  }
  const first = `Strongest fit is ${top.title} at ${top.score} out of 100, with ${top.haveKeywords.length} of ${plural(top.atsKeywords.length, "search keyword")} already on the CV.`;
  if (!top.openJobs) return first;
  const open = top.openJobs === 1 ? "There is 1 open role of this type." : `There are ${top.openJobs} open roles of this type.`;
  return `${first} ${open}`;
}

/** Job titles the candidate is most qualified for, ranked, with the ATS keywords each one is screened on. */
export function recruiterAnalysis(cv: ParsedCV, jobs: JobFeatures[]): { titles: TitleFit[]; headline: string } {
  if (!Array.isArray(jobs)) throw new TypeError("recruiterAnalysis needs an array of jobs");
  const skills = cvSkillSet(cv);
  const text = cvText(cv);
  const families = ROLE_FAMILIES.map((f) => familyFit(cv, f, jobs, skills, text))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const titles: TitleFit[] = [];
  // Families are already sorted, so expanding them in order keeps scores non increasing.
  for (const fit of families) {
    for (const title of fit.family.titles) {
      const key = title.toLowerCase();
      if (seen.has(key) || titles.length >= MAX_TITLES) continue;
      seen.add(key);
      titles.push({
        title,
        roleFamily: fit.family.id,
        score: fit.score,
        atsKeywords: [...fit.atsKeywords],
        haveKeywords: [...fit.haveKeywords],
        missingKeywords: [...fit.missingKeywords],
        openJobs: fit.openJobs,
      });
    }
  }
  return { titles, headline: headline(titles[0]) };
}
