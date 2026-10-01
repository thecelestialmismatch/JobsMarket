import { cvSkillSet } from "@/lib/match/criteria";
import type { JobPosting, JobSource, MarketScan, ParsedCV } from "@/lib/types";

const MIN_BAND_SIZE = 3;
const YEARLY: Record<NonNullable<JobPosting["salaryPeriod"]>, number> = { year: 1, month: 12, day: 230, hour: 1976 };

interface SalaryPoint {
  low: number;
  high: number;
}

function positive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Yearly low and high for one advert, or null when it cannot be compared honestly.
 * A missing period is read as yearly, the usual convention when adverts state a bare figure.
 * A missing or malformed currency drops the advert, because mixing currencies would mislead.
 */
function yearlySalary(job: JobPosting): { currency: string; point: SalaryPoint } | null {
  const currency = job.salaryCurrency?.trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return null;
  const min = positive(job.salaryMin) ? job.salaryMin : undefined;
  const max = positive(job.salaryMax) ? job.salaryMax : undefined;
  if (min === undefined && max === undefined) return null;
  const factor = YEARLY[job.salaryPeriod ?? "year"] ?? 1;
  const low = (min ?? max ?? 0) * factor;
  const high = (max ?? min ?? 0) * factor;
  return { currency, point: { low: Math.min(low, high), high: Math.max(low, high) } };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function salaryBands(open: JobPosting[]): MarketScan["salaryBands"] {
  const groups = new Map<string, { roleFamily: string; currency: string; points: SalaryPoint[] }>();
  for (const job of open) {
    const family = job.requirements.roleFamily;
    const salary = family ? yearlySalary(job) : null;
    if (!family || !salary) continue;
    const key = `${family}|${salary.currency}`;
    const group = groups.get(key) ?? { roleFamily: family, currency: salary.currency, points: [] };
    groups.set(key, { ...group, points: [...group.points, salary.point] });
  }
  return [...groups.values()]
    .filter((g) => g.points.length >= MIN_BAND_SIZE)
    .map((g) => ({
      roleFamily: g.roleFamily,
      min: Math.round(Math.min(...g.points.map((p) => p.low))),
      median: Math.round(median(g.points.map((p) => (p.low + p.high) / 2))),
      max: Math.round(Math.max(...g.points.map((p) => p.high))),
      currency: g.currency,
      n: g.points.length,
    }))
    .sort((a, b) => b.n - a.n || a.roleFamily.localeCompare(b.roleFamily) || a.currency.localeCompare(b.currency));
}

function skillDemand(open: JobPosting[], cv: ParsedCV | undefined): MarketScan["skillDemand"] {
  const have = cv ? cvSkillSet(cv) : new Set<string>();
  const counts = new Map<string, { skill: string; count: number }>();
  for (const job of open) {
    const asked = new Map(
      [...job.requirements.requiredSkills, ...job.requirements.niceSkills, ...job.skills].map((s) => [s.toLowerCase(), s]),
    );
    for (const [key, skill] of asked) {
      counts.set(key, { skill: counts.get(key)?.skill ?? skill, count: (counts.get(key)?.count ?? 0) + 1 });
    }
  }
  return [...counts.entries()]
    .map(([key, c]) => ({ skill: c.skill, count: c.count, share: c.count / open.length, youHave: have.has(key) }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
}

function sourceCounts(open: JobPosting[]): MarketScan["sources"] {
  const counts = new Map<JobSource, number>();
  for (const job of open) counts.set(job.source, (counts.get(job.source) ?? 0) + 1);
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

/** Demand, pay and eligibility across open jobs. Only jobs with status "open" are counted. */
export function marketScan(jobs: JobPosting[], cv?: ParsedCV): MarketScan {
  if (!Array.isArray(jobs)) throw new TypeError("marketScan needs an array of jobs");
  const open = jobs.filter((j) => j.status === "open");
  const barred = open.filter((j) => j.requirements.eligibility.length > 0).length;
  return {
    totalOpen: open.length,
    skillDemand: skillDemand(open, cv),
    salaryBands: salaryBands(open),
    eligibilityShare: open.length ? barred / open.length : 0,
    sources: sourceCounts(open),
  };
}
