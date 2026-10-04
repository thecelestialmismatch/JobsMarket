import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParsedCV } from "@/lib/types";
import { parseCv } from "@/lib/cv/parse";
import { auditResume } from "./index";
import { xyzTemplate } from "./bullets";

const NOW = new Date("2026-10-01T00:00:00Z");
const fixture = (n: string) => parseCv(readFileSync(path.join(__dirname, "../cv/__fixtures__", `${n}.txt`), "utf8"), { now: NOW });

function cv(over: Partial<ParsedCV>): ParsedCV {
  return {
    contact: { name: "Sam Okafor", email: "sam@example.com", phone: "0400 000 111", links: ["linkedin.com/in/sam"] },
    summary: "Cloud engineer.",
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    skills: [],
    skillEvidence: {},
    evidence: [{ id: "E1", section: "summary", text: "Cloud engineer." }],
    yearsExperience: null,
    wordCount: 300,
    rawSections: {},
    warnings: [],
    ...over,
  };
}

describe("auditResume", () => {
  it("scores a well formed fixture higher than a weak one", () => {
    const strong = auditResume(fixture("jordan-avery"), NOW);
    const weak = auditResume(
      cv({
        contact: { links: [] },
        summary: undefined,
        evidence: [
          { id: "E1", section: "experience", text: "Responsible for reports" },
          { id: "E2", section: "experience", text: "Worked on dashboards for the team" },
        ],
        wordCount: 1600,
      }),
      NOW,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.score).toBeGreaterThanOrEqual(1);
    expect(weak.flags.map((f) => f.key)).toEqual(expect.arrayContaining(["metrics", "weak-openers", "length", "summary", "contact"]));
    expect(weak.flags[0].severity).toBe("high");
    expect(weak.toTen).toHaveLength(weak.flags.length);
  });

  it("finds gaps over six months between dated roles", () => {
    const res = auditResume(
      cv({
        experience: [
          { title: "Analyst", employer: "Acme", start: "2018-01", end: "2019-12", evidenceIds: [] },
          { title: "Lead", employer: "Bolt", start: "2021-03", end: "present", evidenceIds: [] },
        ],
      }),
      NOW,
    );
    expect(res.flags.find((f) => f.key === "gaps")?.detail).toContain("14 months before Lead at Bolt");
  });

  it("never invents figures in XYZ templates", () => {
    const t = xyzTemplate("Responsible for weekly reporting");
    expect(t).toContain("[add figure]");
    expect(t).not.toMatch(/\d/);
    expect(xyzTemplate("Cut processing time by 30% using SQL")).toContain("30%");
  });

  it("keeps all user facing text free of banned punctuation", () => {
    const res = auditResume(fixture("messy"), NOW);
    const text = [...res.flags.flatMap((f) => [f.label, f.detail, f.fix]), ...res.toTen].join(" ");
    expect(text).not.toMatch(/[–—;!]|\*\*| {2}/);
  });
});
