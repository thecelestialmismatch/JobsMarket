import { classifyTitle, extractSkills } from "@/lib/skills";
import type { JobPosting, JobRequirements, JobSource } from "@/lib/types";
import { type Board, type BoardSource, boardKey } from "./boards";
import { type Analyze, normalizeJob } from "./normalize";
import { fetchAdzuna } from "./sources/adzuna";
import { fetchAshby } from "./sources/ashby";
import type { FetchDeps, RawJob } from "./sources/common";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { fetchRemotive } from "./sources/remotive";

export interface AdzunaConfig {
  appId: string;
  appKey: string;
  country: string;
  queries: string[];
}

export interface IngestDeps {
  fetch: typeof fetch;
  now: Date;
  analyze: Analyze;
  concurrency?: number;
  timeoutMs?: number;
  userAgent?: string;
  adzuna?: AdzunaConfig;
}

export interface IngestError {
  board: string;
  message: string;
}

export interface IngestResult {
  jobs: JobPosting[];
  /** boardKey of every board that fetched and normalised without error. */
  okBoards: string[];
  errors: IngestError[];
}

const FETCHERS: Record<BoardSource, (board: string, deps: FetchDeps) => Promise<RawJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  remotive: fetchRemotive,
};

interface Task {
  key: string;
  label: string;
  fetch: () => Promise<RawJob[]>;
}

type Outcome = { key: string; jobs: JobPosting[] } | { key: string; error: string };

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function tasksFor(boards: readonly Board[], deps: IngestDeps): Task[] {
  const fetchDeps: FetchDeps = { fetch: deps.fetch, timeoutMs: deps.timeoutMs, userAgent: deps.userAgent };
  const tasks = boards.map((b) => ({
    key: boardKey(b.source, b.board),
    label: b.label,
    fetch: () => FETCHERS[b.source](b.board, fetchDeps),
  }));
  const az = deps.adzuna;
  if (!az) return tasks;
  const search = az.queries.map((query) => ({
    key: boardKey("adzuna", `${az.country.toLowerCase()}/${query}`),
    label: "Adzuna",
    fetch: () => fetchAdzuna(query, { ...fetchDeps, appId: az.appId, appKey: az.appKey, country: az.country }),
  }));
  return [...tasks, ...search];
}

// A job that fails to normalise fails its whole board. Skipping it while reporting the board as OK
// would let reconcile close a live job.
async function runTask(task: Task, deps: IngestDeps): Promise<Outcome> {
  try {
    const raws = await task.fetch();
    const jobs = raws.map((raw) =>
      normalizeJob(raw.company ? raw : { ...raw, company: task.label }, { now: deps.now, analyze: deps.analyze }),
    );
    return { key: task.key, jobs };
  } catch (err) {
    return { key: task.key, error: message(err) };
  }
}

function validate(deps: IngestDeps): number {
  const concurrency = deps.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a whole number of at least 1, got ${deps.concurrency}`);
  }
  if (Number.isNaN(deps.now.getTime())) throw new RangeError("now must be a valid date");
  const az = deps.adzuna;
  if (az && (!az.appId.trim() || !az.appKey.trim() || az.queries.some((q) => !q.trim()))) {
    throw new RangeError("adzuna needs an app id, an app key and non empty queries");
  }
  return concurrency;
}

/** Fetch and normalise every board. One failing board never fails the run. */
export async function ingestAll(boards: readonly Board[], deps: IngestDeps): Promise<IngestResult> {
  const concurrency = validate(deps);
  const outcomes = await mapLimit(tasksFor(boards, deps), concurrency, (t) => runTask(t, deps));
  const okBoards: string[] = [];
  const errors: IngestError[] = [];
  const jobs: JobPosting[] = [];
  for (const o of outcomes) {
    if ("error" in o) errors.push({ board: o.key, message: o.error });
    else {
      okBoards.push(o.key);
      jobs.push(...o.jobs);
    }
  }
  return { jobs: dedupe(jobs), okBoards, errors };
}

// ATS sources carry the full advert and the employer's own apply link, so they beat aggregators.
const SOURCE_RANK: Record<JobSource, number> = { greenhouse: 0, lever: 0, ashby: 0, manual: 0, remotive: 1, adzuna: 2, linkedin: 2 };

const COMPANY_SUFFIX = /\b(?:pty|ltd|limited|inc|incorporated|llc|plc|gmbh|corp|corporation|co)\b\.?/g;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ponytail: exact match on normalised text. "Sydney, NSW" and "Sydney, New South Wales" stay distinct.
// Upgrade path is matching on inferred country and city instead of the raw location string.
function duplicateKey(job: JobPosting): string {
  return [norm(job.company.toLowerCase().replace(COMPANY_SUFFIX, " ")), norm(job.title), norm(job.location)].join("|");
}

function byPreference(a: JobPosting, b: JobPosting): number {
  return SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Drop repeats by id, then by company, title and location. The winner depends only on source rank and
 * id, never on fetch order, so the same twin is kept on every run and liveness does not flap.
 */
export function dedupe(jobs: readonly JobPosting[]): JobPosting[] {
  const ids = new Set<string>();
  const keys = new Set<string>();
  return [...jobs].sort(byPreference).filter((job) => {
    const key = duplicateKey(job);
    if (ids.has(job.id) || keys.has(key)) return false;
    ids.add(job.id);
    keys.add(key);
    return true;
  });
}

/** Fallback analyzer for callers without lib/match. Every extracted skill counts as required. */
export function skillsOnlyAnalyze(input: { title: string; description: string }): JobRequirements {
  return {
    requiredSkills: extractSkills(`${input.title}\n${input.description}`),
    niceSkills: [],
    minYears: null,
    degree: null,
    seniority: null,
    eligibility: [],
    roleFamily: classifyTitle(input.title),
  };
}

const DEFAULT_ADZUNA_QUERIES = ["software engineer", "data analyst", "business analyst", "product manager"];

/** Adzuna settings from ADZUNA_APP_ID and ADZUNA_APP_KEY, or undefined when either is unset. */
export function adzunaFromEnv(env: Record<string, string | undefined>): AdzunaConfig | undefined {
  const appId = env.ADZUNA_APP_ID?.trim();
  const appKey = env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return undefined;
  const queries = (env.ADZUNA_QUERIES ?? "").split(",").map((q) => q.trim()).filter(Boolean);
  return {
    appId,
    appKey,
    country: env.ADZUNA_COUNTRY?.trim().toLowerCase() || "au",
    queries: queries.length ? queries : DEFAULT_ADZUNA_QUERIES,
  };
}
