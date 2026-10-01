import { z } from "zod";
import { htmlToText } from "../html";
import { type FetchDeps, type RawJob, employmentLabel, fetchJson, httpUrl, parseEnvelope, parseItems, toIso } from "./common";

// Optional keyed source. Adzuna returns a description SNIPPET (a few hundred characters), not the
// full advert, so skills and requirements derived from it are thinner than for the ATS sources.
// Schema built from the documented response, https://developer.adzuna.com/docs/search

export type AdzunaDeps = FetchDeps & { appId: string; appKey: string; country: string };

const JobSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  title: z.string().min(1),
  description: z.string().nullish(),
  created: z.string().nullish(),
  redirect_url: httpUrl,
  company: z.object({ display_name: z.string().nullish() }).nullish(),
  location: z.object({ display_name: z.string().nullish() }).nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  salary_is_predicted: z.union([z.string(), z.number()]).nullish(),
  contract_time: z.string().nullish(),
  contract_type: z.string().nullish(),
});

const ListSchema = z.object({ results: z.array(z.unknown()) });

type AdzunaJob = z.infer<typeof JobSchema>;

function toRaw(country: string, j: AdzunaJob): RawJob {
  // Predicted salaries are Adzuna's own estimate, not the employer's figure.
  const stated = String(j.salary_is_predicted ?? "0") !== "1" && (j.salary_min || j.salary_max);
  return {
    source: "adzuna",
    board: country,
    sourceId: String(j.id),
    company: j.company?.display_name?.trim() || null,
    title: htmlToText(j.title),
    location: j.location?.display_name?.trim() ?? "",
    description: htmlToText(j.description ?? ""),
    url: j.redirect_url,
    applyUrl: j.redirect_url,
    postedAt: toIso(j.created),
    employmentType: employmentLabel(j.contract_time ?? j.contract_type),
    countryHint: country.toUpperCase(),
    salary: stated ? { min: j.salary_min || undefined, max: j.salary_max || undefined, period: "year" } : undefined,
  };
}

/** One search page of up to 50 results for `query` in `deps.country` (e.g. "au", "gb"). */
export async function fetchAdzuna(query: string, deps: AdzunaDeps): Promise<RawJob[]> {
  const country = deps.country.toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) throw new Error(`Adzuna country must be a two letter code, got "${deps.country}"`);
  const params = new URLSearchParams({
    app_id: deps.appId,
    app_key: deps.appKey,
    results_per_page: "50",
    what: query,
    "content-type": "application/json",
  });
  const board = `${country}/${query}`;
  const body = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`, "adzuna", board, deps);
  const jobs = parseItems(parseEnvelope(body, ListSchema, "adzuna", board).results, JobSchema, "adzuna", board);
  return jobs.map((j) => toRaw(country, j));
}
