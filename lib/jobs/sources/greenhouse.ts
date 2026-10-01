import { z } from "zod";
import { htmlToText } from "../html";
import { type FetchDeps, type RawJob, fetchJson, httpUrl, parseEnvelope, parseItems, toIso } from "./common";

const API = "https://boards-api.greenhouse.io/v1/boards";

const JobSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  absolute_url: httpUrl,
  company_name: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  content: z.string().nullish(),
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
  application_deadline: z.string().nullish(),
});

const ListSchema = z.object({ jobs: z.array(z.unknown()) });
const BoardSchema = z.object({ name: z.string().min(1) });

type GreenhouseJob = z.infer<typeof JobSchema>;

function toRaw(board: string, company: string | null, j: GreenhouseJob): RawJob {
  return {
    source: "greenhouse",
    board,
    sourceId: String(j.id),
    company: j.company_name?.trim() || company,
    title: j.title,
    location: j.location?.name?.trim() ?? "",
    description: htmlToText(j.content ?? ""),
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    postedAt: toIso(j.first_published) ?? toIso(j.updated_at),
    closesAt: toIso(j.application_deadline),
  };
}

export async function fetchGreenhouse(board: string, deps: FetchDeps): Promise<RawJob[]> {
  const slug = encodeURIComponent(board);
  const body = await fetchJson(`${API}/${slug}/jobs?content=true`, "greenhouse", board, deps);
  const jobs = parseItems(parseEnvelope(body, ListSchema, "greenhouse", board).jobs, JobSchema, "greenhouse", board);
  // Jobs usually carry company_name. Only ask the board endpoint when one does not.
  let company: string | null = null;
  if (jobs.some((j) => !j.company_name?.trim())) {
    const meta = await fetchJson(`${API}/${slug}`, "greenhouse", board, deps);
    company = parseEnvelope(meta, BoardSchema, "greenhouse", board).name.trim();
  }
  return jobs.map((j) => toRaw(board, company, j));
}
