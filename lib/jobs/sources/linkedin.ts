import { z } from "zod";
import { type RawJob, SourceError, httpUrl, parseItems, toIso } from "./common";

// Reads the JSON printed by sidecar/linkedin/scrape.py. No network here, the scraper runs on the
// owner's machine in its own process and only this JSON crosses the boundary.
const BOARD = "linkedin";
const JOB_ID = /^https?:\/\/(?:[\w-]+\.)?linkedin\.com\/jobs\/view\/(?:[\w-]*-)?(\d+)/i;

const ItemSchema = z.object({
  linkedin_url: httpUrl.regex(JOB_ID),
  job_title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().nullish(),
  posted_date: z.string().nullish(),
  job_description: z.string().nullish(),
});

export const MAX_LINKEDIN_JOBS = 200;

// Rows expire 30 days after the last import that listed them, since a LinkedIn search never tells us a job closed.
const EXPIRY_DAYS = 30;

export function parseLinkedInJobs(body: unknown, now: Date): RawJob[] {
  if (!Array.isArray(body)) throw new SourceError("linkedin", BOARD, null, "linkedin import must be a JSON array");
  if (body.length > MAX_LINKEDIN_JOBS) throw new SourceError("linkedin", BOARD, null, `linkedin import is limited to ${MAX_LINKEDIN_JOBS} jobs`);
  return parseItems(body, ItemSchema, "linkedin", BOARD).map((j) => {
    const url = j.linkedin_url.split("?")[0];
    return {
      source: "linkedin",
      board: BOARD,
      sourceId: JOB_ID.exec(url)![1],
      company: j.company.trim(),
      title: j.job_title,
      location: j.location?.trim() ?? "",
      description: j.job_description?.trim() ?? "",
      url,
      applyUrl: url,
      // The scraper reports relative dates such as "2 days ago", which toIso drops.
      postedAt: toIso(j.posted_date),
      closesAt: new Date(now.getTime() + EXPIRY_DAYS * 86_400_000).toISOString(),
    };
  });
}
