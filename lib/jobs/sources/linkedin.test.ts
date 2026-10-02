import { describe, expect, it } from "vitest";
import { analyzeJob } from "@/lib/match";
import { reconcile } from "../liveness";
import { normalizeJob } from "../normalize";
import { SourceError } from "./common";
import { parseLinkedInJobs } from "./linkedin";

const NOW = new Date("2026-10-01T00:00:00Z");
const good = {
  linkedin_url: "https://www.linkedin.com/jobs/view/4012345678/?trackingId=abc",
  job_title: "Reporting Analyst",
  company: "Quillfeather Analytics",
  location: "Melbourne, Victoria, Australia",
  posted_date: "2 days ago",
  job_description: "Use SQL and Power BI.",
};

describe("parseLinkedInJobs", () => {
  it("maps a scraper job to a raw job with a stable id and no tracking query", () => {
    const [j] = parseLinkedInJobs([good], NOW);
    expect(j).toMatchObject({ source: "linkedin", sourceId: "4012345678", company: "Quillfeather Analytics", url: "https://www.linkedin.com/jobs/view/4012345678/" });
    expect(j.postedAt).toBeUndefined();
  });
  it("skips bad items and keeps good ones", () => {
    expect(parseLinkedInJobs([good, { ...good, linkedin_url: "https://evil.example/jobs/view/1" }, { job_title: "" }], NOW)).toHaveLength(1);
  });
  it("fails when nothing matches, so a changed shape is loud", () => {
    expect(() => parseLinkedInJobs([{ nope: 1 }], NOW)).toThrow(SourceError);
  });
  it("rejects a non array body and an oversized one", () => {
    expect(() => parseLinkedInJobs({}, NOW)).toThrow(SourceError);
    expect(() => parseLinkedInJobs(Array(201).fill(good), NOW)).toThrow(SourceError);
  });
  it("re-import keeps the first seen date, pushes expiry out and expires rows not listed again", () => {
    const run = (now: Date, items: unknown[]) => parseLinkedInJobs(items, now).map((r) => normalizeJob(r, { now, analyze: analyzeJob }));
    const first = run(NOW, [good]);
    const later = new Date("2026-10-20T00:00:00Z");
    const again = reconcile(first, run(later, [good]), [], later).upserts[0];
    expect(again.retrievedAt).toBe(first[0].retrievedAt);
    expect(again.closesAt! > first[0].closesAt!).toBe(true);
    const gone = new Date("2026-12-01T00:00:00Z");
    expect(reconcile(first, [], [], gone).closedIds).toEqual([first[0].id]);
  });
});
