import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCv } from "@/lib/cv/parse";
import { demoJobs } from "@/lib/store/demo-jobs";
import { marketScan, recruiterAnalysis, skillGaps } from "./index";

const NOW = new Date("2026-10-01T00:00:00Z");
const cv = parseCv(readFileSync(path.join(__dirname, "../cv/__fixtures__/jordan-avery.txt"), "utf8"), { now: NOW });
const jobs = demoJobs(NOW);

describe("recruiterAnalysis", () => {
  it("ranks 20 titles with monotonic scores, data roles first for a data analyst CV", () => {
    const { titles, headline } = recruiterAnalysis(cv, jobs);
    expect(titles).toHaveLength(20);
    for (let i = 1; i < titles.length; i++) expect(titles[i].score).toBeLessThanOrEqual(titles[i - 1].score);
    expect(["data-analyst", "bi-developer", "cx-analyst"]).toContain(titles[0].roleFamily);
    expect(titles[0].haveKeywords).toEqual(expect.arrayContaining(["SQL"]));
    expect(headline).not.toMatch(/[–—;!]/);
  });
});

describe("marketScan", () => {
  it("counts demand, sources and eligibility across open jobs", () => {
    const scan = marketScan(jobs, cv);
    expect(scan.totalOpen).toBe(jobs.length);
    expect(scan.skillDemand[0].count).toBeGreaterThan(0);
    expect(scan.skillDemand.find((s) => s.skill === "SQL")?.youHave).toBe(true);
    expect(scan.sources).toEqual([{ source: "manual", count: jobs.length }]);
    expect(scan.eligibilityShare).toBeGreaterThan(0);
    for (const b of scan.salaryBands) expect(b.n).toBeGreaterThanOrEqual(3);
  });
});

describe("skillGaps", () => {
  it("returns missing skills with honest gains and a learning step", () => {
    const gaps = skillGaps(cv, jobs);
    expect(gaps.length).toBeLessThanOrEqual(5);
    for (const g of gaps) {
      expect(cv.skills).not.toContain(g.skill);
      expect(g.scoreGain).toBeGreaterThanOrEqual(0);
      expect(g.learn.length).toBeGreaterThan(10);
    }
  });
});
