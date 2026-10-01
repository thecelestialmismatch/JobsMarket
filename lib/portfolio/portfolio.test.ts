import { describe, expect, it, vi } from "vitest";
import type { ParsedCV } from "@/lib/types";
import { buildPortfolio, portfolioSlug } from "./build";
import { fetchGithubRepos, GithubError, mergeGithubEvidence, parseGithubUsername } from "./github";

const cv: ParsedCV = {
  contact: { name: "Jordan Avery", email: "jordan.avery@example.com", location: "Melbourne VIC", links: ["github.com/jordan-avery"] },
  summary: "Reporting analyst.",
  experience: [
    { title: "Reporting Analyst", employer: "Northwind Telecom", start: "2023-01", end: "present", evidenceIds: ["E2", "E3"] },
  ],
  education: [],
  projects: [{ title: "Churn dashboard", evidenceIds: ["E4"] }],
  certifications: [],
  skills: ["SQL", "Power BI", "Excel"],
  skillEvidence: { SQL: ["E2"], "Power BI": ["E2", "E4"], Excel: ["E3"] },
  evidence: [
    { id: "E1", section: "summary", text: "Reporting analyst with SQL and Power BI experience." },
    { id: "E2", section: "experience", text: "Rebuilt weekly reporting in SQL and Power BI.", employer: "Northwind Telecom" },
    { id: "E3", section: "experience", text: "Reconciled rosters in Excel.", employer: "Northwind Telecom" },
    { id: "E4", section: "project", text: "Built a churn dashboard in Power BI." },
  ],
  yearsExperience: 3,
  wordCount: 120,
  rawSections: {},
  warnings: [],
};

const repoJson = [
  { name: "sales-forecast", description: "Forecasts weekly sales — uses Python; pandas", html_url: "https://github.com/jordan-avery/sales-forecast", language: "Python", topics: [], fork: false, archived: false, stargazers_count: 3, pushed_at: "2026-08-01T00:00:00Z" },
  { name: "forked-thing", description: "fork", html_url: "https://github.com/jordan-avery/f", language: null, fork: true, archived: false, stargazers_count: 0, pushed_at: "2026-08-01T00:00:00Z" },
  { name: "no-desc", description: null, html_url: "https://github.com/jordan-avery/n", language: null, fork: false, archived: false, stargazers_count: 0, pushed_at: "2026-08-01T00:00:00Z" },
  { bogus: true },
];

describe("github import", () => {
  it("parses usernames and profile links", () => {
    expect(parseGithubUsername("https://github.com/jordan-avery/")).toBe("jordan-avery");
    expect(parseGithubUsername("@jordan-avery")).toBe("jordan-avery");
    expect(parseGithubUsername("bad name!")).toBeNull();
  });

  it("keeps own, described, valid repos only and maps errors", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(repoJson), { status: 200 }));
    const repos = await fetchGithubRepos("jordan-avery", { fetch: ok as unknown as typeof fetch });
    expect(repos.map((r) => r.name)).toEqual(["sales-forecast"]);
    const missing = vi.fn(async () => new Response("", { status: 404 }));
    await expect(fetchGithubRepos("ghost", { fetch: missing as unknown as typeof fetch })).rejects.toMatchObject({ code: "not_found" });
    await expect(fetchGithubRepos("!!", { fetch: ok as unknown as typeof fetch })).rejects.toBeInstanceOf(GithubError);
  });

  it("merges repos as new evidence with clean text, idempotently", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(repoJson), { status: 200 }));
    const repos = await fetchGithubRepos("jordan-avery", { fetch: ok as unknown as typeof fetch });
    const merged = mergeGithubEvidence(cv, repos);
    const gh = merged.evidence.filter((e) => e.source === "github");
    expect(gh).toHaveLength(1);
    expect(gh[0].id).toBe("E5");
    expect(gh[0].text).not.toMatch(/[—;:]/);
    expect(merged.skills).toContain("Python");
    expect(merged.skillEvidence.Python).toEqual(["E5"]);
    const again = mergeGithubEvidence(merged, repos);
    expect(again.evidence.filter((e) => e.source === "github")).toHaveLength(1);
    expect(cv.evidence).toHaveLength(4); // input not mutated
  });
});

describe("portfolio builder", () => {
  it("ranks items by the role family's core skills and cites evidence on every line", () => {
    const page = buildPortfolio(cv, "data-analyst", { id: "p1", slug: "jordan-avery-data-analyst-abc123", now: new Date("2026-09-27T00:00:00Z") });
    expect(page.roleLabel).toBe("Data Analyst");
    expect(page.headline.startsWith("Data Analyst")).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
    const ids = new Set(cv.evidence.map((e) => e.id));
    for (const item of page.items) for (const l of item.lines) expect(l.evidenceIds.every((id) => ids.has(id))).toBe(true);
    expect(page.email).toBeUndefined();
    expect(page.published).toBe(false);
  });

  it("includes email only on opt in and rejects unknown families", () => {
    const opts = { id: "p1", slug: "x-abcdef", now: new Date(), includeEmail: true };
    expect(buildPortfolio(cv, "data-analyst", opts).email).toBe("jordan.avery@example.com");
    expect(() => buildPortfolio(cv, "no-such-family", opts)).toThrow();
  });

  it("makes url safe slugs", () => {
    expect(portfolioSlug("Jordan Avery", "data-analyst", "A1B2C3")).toBe("jordan-avery-data-analyst-a1b2c3");
  });
});
