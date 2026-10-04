import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCv } from "@/lib/cv/parse";
import { scoreMatch } from "@/lib/match";
import { demoJobs } from "@/lib/store/demo-jobs";
import { generateKitDeterministic } from "./deterministic";
import { renderText } from "./docx";

const NOW = new Date("2026-10-01T00:00:00Z");
const cvOf = (n: string) => parseCv(readFileSync(path.join(__dirname, "../cv/__fixtures__", `${n}.txt`), "utf8"), { now: NOW });
const jobs = demoJobs(NOW);
const job = (key: string) => jobs.find((j) => j.id.endsWith(key))!;

const PAIRS: [string, string][] = [
  ["jordan-avery", "quillfeather-reporting"],
  ["jordan-avery", "tallowood-servicedesk"],
  ["sam-okafor", "kestrel-cloud"],
  ["priya-nair", "saltbush-cx"],
  ["messy", "coralbay-ba"],
];

describe("generateKitDeterministic", () => {
  it.each(PAIRS)("%s for %s passes lint and fact check with zero issues", (cvName, jobKey) => {
    const cv = cvOf(cvName);
    const j = job(jobKey);
    const kit = generateKitDeterministic(cv, j, scoreMatch(cv, j, {}, NOW), { now: NOW, id: "k1" });
    const errors = kit.lint.filter((l) => l.severity === "error");
    expect(errors, JSON.stringify(errors, null, 1)).toEqual([]);
    expect(kit.facts, JSON.stringify(kit.facts, null, 1)).toEqual([]);
    expect(kit.documents.map((d) => d.kind)).toEqual(expect.arrayContaining(["cv", "cover_letter", "outreach", "linkedin", "interview_prep"]));
  });

  it("keeps the cover letter under 350 words and the outreach note under 75", () => {
    const cv = cvOf("jordan-avery");
    const j = job("quillfeather-reporting");
    const kit = generateKitDeterministic(cv, j, scoreMatch(cv, j, {}, NOW), { now: NOW, id: "k1" });
    const words = (k: string) => renderText(kit.documents.find((d) => d.kind === k)!).split(/\s+/).filter(Boolean).length;
    expect(words("cover_letter")).toBeLessThan(350);
    expect(words("outreach")).toBeLessThan(75);
  });

  it("includes a portfolio only for portfolio worthy roles with projects", () => {
    const sam = cvOf("sam-okafor");
    const cloud = job("kestrel-cloud");
    const service = job("tallowood-servicedesk");
    const a = generateKitDeterministic(sam, service, scoreMatch(sam, service, {}, NOW), { now: NOW, id: "a" });
    expect(a.portfolioIncluded).toBe(false);
    expect(a.portfolioReason).toMatch(/^No portfolio/);
    const b = generateKitDeterministic(sam, cloud, scoreMatch(sam, cloud, {}, NOW), { now: NOW, id: "b" });
    expect(typeof b.portfolioIncluded).toBe("boolean");
  });

  it("never cites evidence that is not in the CV", () => {
    const cv = cvOf("sam-okafor");
    const j = job("kestrel-cloud");
    const kit = generateKitDeterministic(cv, j, scoreMatch(cv, j, {}, NOW), { now: NOW, id: "k" });
    const ids = new Set([...cv.evidence.map((e) => e.id), "JOB"]);
    for (const d of kit.documents) for (const sec of d.sections) for (const it of sec.items) for (const id of it.evidenceIds) expect(ids.has(id)).toBe(true);
  });
});
