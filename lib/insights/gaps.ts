import { learnHint } from "@/lib/skills";
import { evaluate } from "@/lib/match/criteria";
import { withSkill } from "@/lib/match/suggestions";
import type { JobFeatures, ParsedCV, SkillGap } from "@/lib/types";

const TARGET_JOBS = 25;

function postedTime(job: JobFeatures): number {
  const t = job.postedAt ? Date.parse(job.postedAt) : Number.NaN;
  return Number.isNaN(t) ? Number.MIN_SAFE_INTEGER : t;
}

/** The best scoring jobs that are not closed, ordered as rankMatches orders them. */
function targetJobs(cv: ParsedCV, jobs: JobFeatures[]): { job: JobFeatures; score: number; lacking: string[] }[] {
  return jobs
    .filter((job) => job.status !== "closed")
    .map((job) => {
      const ev = evaluate(cv, job);
      return { job, score: ev.score, lacking: [...ev.missingSkills, ...ev.niceMissing] };
    })
    .sort((a, b) => b.score - a.score || postedTime(b.job) - postedTime(a.job))
    .slice(0, TARGET_JOBS);
}

/**
 * Skills the target jobs ask for most often that the CV does not evidence. The gain is the average
 * score change across all target jobs when the skill is evidenced, so jobs that do not ask for it count as zero.
 */
export function skillGaps(cv: ParsedCV, jobs: JobFeatures[], topN = 5): SkillGap[] {
  if (!Array.isArray(jobs)) throw new TypeError("skillGaps needs an array of jobs");
  if (!Number.isInteger(topN) || topN < 0) throw new RangeError("skillGaps needs a whole number topN of 0 or more");
  const targets = targetJobs(cv, jobs);
  if (!targets.length || !topN) return [];
  const demand = new Map<string, { skill: string; count: number }>();
  for (const t of targets) {
    for (const skill of new Set(t.lacking)) {
      const key = skill.toLowerCase();
      demand.set(key, { skill: demand.get(key)?.skill ?? skill, count: (demand.get(key)?.count ?? 0) + 1 });
    }
  }
  return [...demand.values()]
    .map(({ skill, count }) => {
      const next = withSkill(cv, skill);
      const total = targets.reduce((sum, t) => sum + evaluate(next, t.job).score - t.score, 0);
      return {
        skill,
        demandShare: count / targets.length,
        scoreGain: Math.round((10 * total) / targets.length) / 10,
        learn: learnHint(skill),
      };
    })
    .sort((a, b) => b.demandShare - a.demandShare || b.scoreGain - a.scoreGain || a.skill.localeCompare(b.skill))
    .slice(0, topN);
}
