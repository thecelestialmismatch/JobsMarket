import { z } from "zod";
import {
  type FetchDeps,
  type RawJob,
  type RawSalary,
  employmentLabel,
  fetchJson,
  httpUrl,
  parseEnvelope,
  parseItems,
  toIso,
} from "./common";

const API = "https://api.ashbyhq.com/posting-api/job-board";

const ComponentSchema = z.object({
  compensationType: z.string().nullish(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
});

const JobSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  location: z.string().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  employmentType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  publishedAt: z.string().nullish(),
  jobUrl: httpUrl,
  applyUrl: httpUrl.nullish(),
  isListed: z.boolean().nullish(),
  address: z
    .object({ postalAddress: z.object({ addressCountry: z.string().nullish() }).nullish() })
    .nullish(),
  compensation: z
    .object({
      summaryComponents: z.array(ComponentSchema).nullish(),
      scrapeableCompensationSalarySummary: z.string().nullish(),
    })
    .nullish(),
});

const ListSchema = z.object({ jobs: z.array(z.unknown()) });

type AshbyJob = z.infer<typeof JobSchema>;

const INTERVALS: Record<string, RawSalary["period"]> = {
  "1 YEAR": "year",
  "1 MONTH": "month",
  "1 DAY": "day",
  "1 HOUR": "hour",
};

function salary(j: AshbyJob): RawSalary | undefined {
  const c = j.compensation?.summaryComponents?.find(
    (x) => x.compensationType === "Salary" && (x.minValue || x.maxValue),
  );
  if (!c) return undefined;
  return {
    min: c.minValue || undefined,
    max: c.maxValue || undefined,
    currency: c.currencyCode ?? undefined,
    period: c.interval ? INTERVALS[c.interval] : undefined,
  };
}

function toRaw(board: string, j: AshbyJob): RawJob {
  return {
    source: "ashby",
    board,
    sourceId: j.id,
    company: null,
    title: j.title,
    location: j.location?.trim() ?? "",
    description: j.descriptionPlain?.trim() ?? "",
    url: j.jobUrl,
    applyUrl: j.applyUrl ?? j.jobUrl,
    postedAt: toIso(j.publishedAt),
    employmentType: employmentLabel(j.employmentType),
    workplace: j.workplaceType ?? undefined,
    isRemote: j.isRemote ?? undefined,
    countryHint: j.address?.postalAddress?.addressCountry ?? undefined,
    salary: salary(j),
    salaryText: j.compensation?.scrapeableCompensationSalarySummary ?? undefined,
  };
}

export async function fetchAshby(board: string, deps: FetchDeps): Promise<RawJob[]> {
  const url = `${API}/${encodeURIComponent(board)}?includeCompensation=true`;
  const body = await fetchJson(url, "ashby", board, deps);
  const jobs = parseItems(parseEnvelope(body, ListSchema, "ashby", board).jobs, JobSchema, "ashby", board);
  return jobs.filter((j) => j.isListed !== false).map((j) => toRaw(board, j));
}
