import { z } from "zod";
import { htmlToText } from "../html";
import { type FetchDeps, type RawJob, employmentLabel, fetchJson, httpUrl, parseEnvelope, parseItems, toIso } from "./common";

// Remotive terms: link back to the Remotive posting, credit Remotive as the source, and call this
// endpoint no more than a few times a day (they advise at most 4). url and applyUrl therefore stay
// on remotive.com and the ingest schedule must respect the daily cap.
const API = "https://remotive.com/api/remote-jobs?limit=100";

const JobSchema = z.object({
  id: z.number(),
  url: httpUrl,
  title: z.string().min(1),
  company_name: z.string().min(1),
  job_type: z.string().nullish(),
  publication_date: z.string().nullish(),
  candidate_required_location: z.string().nullish(),
  salary: z.string().nullish(),
  description: z.string().nullish(),
});

const ListSchema = z.object({ jobs: z.array(z.unknown()) });

type RemotiveJob = z.infer<typeof JobSchema>;

function toRaw(board: string, j: RemotiveJob): RawJob {
  return {
    source: "remotive",
    board,
    sourceId: String(j.id),
    company: j.company_name.trim(),
    title: j.title,
    location: j.candidate_required_location?.trim() ?? "",
    description: htmlToText(j.description ?? ""),
    url: j.url,
    applyUrl: j.url,
    postedAt: toIso(j.publication_date),
    employmentType: employmentLabel(j.job_type),
    workplace: "remote",
    salaryText: j.salary?.trim() || undefined,
  };
}

/** board is a label only (use "remotive"). Remotive exposes one feed. */
export async function fetchRemotive(board: string, deps: FetchDeps): Promise<RawJob[]> {
  const body = await fetchJson(API, "remotive", board, deps);
  const jobs = parseItems(parseEnvelope(body, ListSchema, "remotive", board).jobs, JobSchema, "remotive", board);
  return jobs.map((j) => toRaw(board, j));
}
