import { describe, expect, it } from "vitest";
import type { JobPosting, MatchResult } from "@/lib/types";
import { toFull, toPreview } from "./index";

const job: JobPosting = {
  id: "greenhouse-quillfeather-1",
  source: "greenhouse",
  sourceId: "1",
  board: "quillfeather",
  company: "Quillfeather Analytics",
  title: "Reporting Analyst",
  location: "Melbourne VIC",
  country: "AU",
  remote: "hybrid",
  description: "Quillfeather Analytics needs SQL and Power BI.",
  url: "https://jobs.example.test/quillfeather/1",
  applyUrl: "https://jobs.example.test/quillfeather/1/apply",
  retrievedAt: "2026-09-20T00:00:00.000Z",
  lastCheckedAt: "2026-09-27T00:00:00.000Z",
  status: "open",
  skills: ["SQL", "Power BI"],
  requirements: {
    requiredSkills: ["SQL", "Power BI", "Tableau"],
    niceSkills: [],
    minYears: 2,
    degree: null,
    seniority: "mid",
    eligibility: [],
    roleFamily: "data-analyst",
  },
};

const match: MatchResult = {
  jobId: job.id,
  score: 72,
  band: "good",
  criteria: [],
  matchedSkills: ["SQL", "Power BI"],
  missingSkills: ["Tableau"],
  niceMissing: [],
  eligibility: [],
  timing: { postedDaysAgo: 7, closesInDays: null, label: "Posted 7 days ago" },
  explanation: "Matches 2 of 3 required skills, including SQL and Power BI.",
  suggestions: [{ kind: "add_evidence", action: "Add a Tableau bullet if you have used it.", gain: 9 }],
};

describe("gate", () => {
  it("preview carries no company, description, links or suggestions even when given a full posting", () => {
    const preview = toPreview(job, match);
    const json = JSON.stringify(preview);
    expect(json).not.toContain("Quillfeather");
    expect(json).not.toContain("example.test");
    expect(json).not.toContain("Tableau bullet");
    expect(Object.keys(preview).sort()).toEqual(
      ["band", "explanation", "jobId", "location", "locked", "matchedCount", "postedDaysAgo", "remote", "requiredCount", "score", "title"],
    );
    expect(preview.matchedCount).toBe(2);
  });

  it("marks jobs first seen after the last visit as new", () => {
    expect(toFull(job, match, "2026-09-19T00:00:00.000Z").isNew).toBe(true);
    expect(toFull(job, match, "2026-09-21T00:00:00.000Z").isNew).toBe(false);
    expect(toFull(job, match, null).isNew).toBe(false);
  });
});
