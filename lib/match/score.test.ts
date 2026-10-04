import { describe, expect, it } from "vitest";
import { learnHint, roleFamily } from "@/lib/skills";
import type { Criterion, JobFeatures, ParsedCV } from "@/lib/types";
import { deepFreeze, makeCV, makeJob, textViolations } from "./__fixtures__/fixtures";
import { RUBRIC, band, rankMatches, scoreMatch } from "./score";

const NOW = new Date("2026-09-27T10:00:00Z");
const cv = deepFreeze(makeCV());

const fullJob = deepFreeze(
  makeJob({}, { requiredSkills: ["SQL", "Power BI"], niceSkills: ["Tableau"], minYears: 3, degree: "bachelor", roleFamily: "data-analyst" }),
);

function byKey(criteria: Criterion[], key: Criterion["key"]): Criterion {
  const c = criteria.find((x) => x.key === key);
  if (!c) throw new Error(`criterion ${key} missing`);
  return c;
}

function recompute(criteria: Criterion[]): number {
  const applicable = criteria.filter((c) => c.status !== "not_applicable");
  const weight = applicable.reduce((s, c) => s + c.weight, 0);
  return weight ? Math.round((100 * applicable.reduce((s, c) => s + c.earned, 0)) / weight) : 0;
}

function evidenced(base: ParsedCV, skill: string): ParsedCV {
  return deepFreeze({ ...base, skills: [...base.skills, skill], skillEvidence: { ...base.skillEvidence, [skill]: ["E99"] } });
}

function generatedStrings(result: ReturnType<typeof scoreMatch>): string[] {
  const hints = new Set([...result.missingSkills, ...result.niceMissing].map(learnHint));
  return [
    result.explanation,
    result.timing.label,
    ...result.criteria.flatMap((c) => [c.label, c.note]),
    ...result.suggestions.map((s) => s.action).filter((a) => !hints.has(a)),
  ];
}

describe("RUBRIC", () => {
  it("is frozen and sums to 100", () => {
    expect(RUBRIC).toEqual({ skills: 50, role: 20, experience: 15, location: 10, education: 5 });
    expect(Object.isFrozen(RUBRIC)).toBe(true);
    expect(Object.values(RUBRIC).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("scoreMatch criteria", () => {
  it("scores a well matched job with every criterion applicable", () => {
    const r = scoreMatch(cv, fullJob, undefined, NOW);
    expect(r.criteria.map((c) => c.key)).toEqual(["skills", "role", "experience", "location", "education"]);
    expect(byKey(r.criteria, "skills")).toMatchObject({ status: "met", earned: 42.5, weight: 50 });
    expect(byKey(r.criteria, "skills").evidenceIds).toEqual(expect.arrayContaining(["E3", "E2"]));
    expect(r.criteria.filter((c) => c.key !== "skills").every((c) => c.status === "met" && c.earned === c.weight)).toBe(true);
    expect(r.score).toBe(93);
    expect(r.band).toBe("strong");
    expect(r.matchedSkills).toEqual(["SQL", "Power BI"]);
    expect(r.missingSkills).toEqual([]);
    expect(r.niceMissing).toEqual(["Tableau"]);
  });

  it("renormalises over applicable criteria when the advert states nothing for some", () => {
    const job = deepFreeze(makeJob({}, { requiredSkills: ["SQL", "Tableau"], roleFamily: "data-analyst" }));
    const r = scoreMatch(cv, job, undefined, NOW);
    expect(byKey(r.criteria, "experience")).toMatchObject({ status: "not_applicable", earned: 0 });
    expect(byKey(r.criteria, "education")).toMatchObject({ status: "not_applicable", earned: 0 });
    expect(byKey(r.criteria, "skills")).toMatchObject({ status: "partial", earned: 25 });
    expect(r.score).toBe(Math.round((100 * (25 + 20 + 10)) / 80));
    expect(r.score).toBe(recompute(r.criteria));
  });

  it("gives nice skills the full weight when the advert lists no required skills", () => {
    const job = deepFreeze(makeJob({}, { niceSkills: ["SQL", "Tableau"], roleFamily: "data-analyst" }));
    expect(byKey(scoreMatch(cv, job, undefined, NOW).criteria, "skills")).toMatchObject({ earned: 25, status: "partial" });
  });

  it("falls back to the job skill list when requirements carry none", () => {
    const job = deepFreeze(makeJob({ skills: ["SQL", "Tableau"] }, { roleFamily: "data-analyst" }));
    const r = scoreMatch(cv, job, undefined, NOW);
    expect(r.missingSkills).toEqual(["Tableau"]);
    expect(byKey(r.criteria, "skills").earned).toBe(25);
  });

  it("scores missing evidence as zero and keeps it visible in the denominator", () => {
    const noEducation = deepFreeze(makeCV({ education: [] }));
    const r = scoreMatch(noEducation, fullJob, undefined, NOW);
    const edu = byKey(r.criteria, "education");
    expect(edu).toMatchObject({ status: "missing", earned: 0, weight: 5 });
    expect(edu.note).toMatch(/^No evidence was found/);
    expect(r.score).toBe(recompute(r.criteria));
    expect(r.score).toBe(Math.round(87.5));
    const notAsked = scoreMatch(noEducation, deepFreeze(makeJob({}, { ...fullJob.requirements, degree: null })), undefined, NOW);
    expect(notAsked.score).toBeGreaterThan(r.score);
  });

  it("scores an empty CV at zero with every criterion missing", () => {
    const empty = deepFreeze(
      makeCV({ contact: { links: [] }, experience: [], education: [], skills: [], skillEvidence: {}, evidence: [], yearsExperience: null }),
    );
    const r = scoreMatch(empty, fullJob, undefined, NOW);
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
    expect(r.criteria.every((c) => c.status === "missing" && c.earned === 0)).toBe(true);
    expect(r.explanation).toBe("Matches none of the 2 required skills. Years of experience could not be confirmed from the CV.");
  });

  it("scores zero with a plain explanation when nothing applies", () => {
    const job = deepFreeze(makeJob({ title: "Senior", location: "", country: undefined }));
    const r = scoreMatch(cv, job, undefined, NOW);
    expect(r.criteria.every((c) => c.status === "not_applicable")).toBe(true);
    expect(r.score).toBe(0);
    expect(r.explanation).toBe("The advert states too little to score this match.");
  });
});

describe("role criterion", () => {
  it("gives a related family half the points only when core skill overlap reaches 40 percent", () => {
    const engineer = deepFreeze(makeCV({ experience: [{ title: "Software Engineer", employer: "Northwind Telecom", start: "2021-01", end: "present", evidenceIds: ["E2"] }] }));
    const role = byKey(scoreMatch(engineer, fullJob, undefined, NOW).criteria, "role");
    const da = roleFamily("data-analyst")?.coreSkills ?? [];
    const se = new Set(roleFamily("software-engineer")?.coreSkills ?? []);
    const overlap = da.filter((s) => se.has(s)).length / da.length;
    expect(role).toMatchObject(overlap >= 0.4 ? { status: "partial", earned: 10 } : { status: "missing", earned: 0 });
  });

  it("falls back to title word overlap when the job has no role family", () => {
    const job = (title: string) => deepFreeze(makeJob({ title }, { roleFamily: null }));
    const withTitle = (title: string) => deepFreeze(makeCV({ experience: [{ title, employer: "Harbourline Logistics", evidenceIds: ["E4"] }] }));
    const role = (cvTitle: string) => byKey(scoreMatch(withTitle(cvTitle), job("Zeppelin Hangar Rigging Specialist"), undefined, NOW).criteria, "role");
    expect(role("Zeppelin Rigging Specialist")).toMatchObject({ status: "met", earned: 20 });
    expect(role("Zeppelin Hangar Inspector")).toMatchObject({ status: "partial", earned: 10 });
    expect(role("Hangar Safety Officer")).toMatchObject({ status: "missing", earned: 0 });
  });

  it("marks role missing when the CV has no roles", () => {
    const r = scoreMatch(deepFreeze(makeCV({ experience: [] })), fullJob, undefined, NOW);
    expect(byKey(r.criteria, "role")).toMatchObject({ status: "missing", earned: 0 });
  });
});

describe("experience and education criteria", () => {
  const job = (minYears: number | null, degree: JobFeatures["requirements"]["degree"] = null) =>
    deepFreeze(makeJob({}, { requiredSkills: ["SQL"], minYears, degree, roleFamily: "data-analyst" }));

  it("scales experience by years over the minimum", () => {
    expect(byKey(scoreMatch(cv, job(5), undefined, NOW).criteria, "experience")).toMatchObject({ status: "partial", earned: 12 });
    expect(byKey(scoreMatch(cv, job(0), undefined, NOW).criteria, "experience")).toMatchObject({ status: "met", earned: 15 });
    const undated = deepFreeze(makeCV({ yearsExperience: null }));
    const missing = byKey(scoreMatch(undated, job(3), undefined, NOW).criteria, "experience");
    expect(missing).toMatchObject({ status: "missing", earned: 0 });
    expect(missing.note).toMatch(/^No evidence was found/);
  });

  it("maps qualifications to levels, with a diploma below bachelor", () => {
    const withQual = (qualification: string) =>
      deepFreeze(makeCV({ education: [{ institution: "Kestrel Bay Institute", qualification, evidenceId: "E5" }] }));
    const edu = (qualification: string, degree: "bachelor" | "master" | "phd") =>
      byKey(scoreMatch(withQual(qualification), job(null, degree), undefined, NOW).criteria, "education");
    expect(edu("Diploma of Business", "bachelor")).toMatchObject({ status: "partial", earned: 2.5 });
    expect(edu("Master of Data Science", "bachelor")).toMatchObject({ status: "met", earned: 5, evidenceIds: ["E5"] });
    expect(edu("Bachelor of Science", "master")).toMatchObject({ status: "partial" });
    expect(edu("PhD in Statistics", "phd")).toMatchObject({ status: "met" });
    expect(edu("Certificate of Attendance in Yoga", "bachelor")).toMatchObject({ status: "partial" });
    expect(edu("First Aid", "bachelor")).toMatchObject({ status: "missing", earned: 0 });
  });
});

describe("location criterion", () => {
  const loc = (candidate: ParsedCV, job: JobFeatures, prefs?: Parameters<typeof scoreMatch>[2]) =>
    byKey(scoreMatch(candidate, job, prefs, NOW).criteria, "location");
  const at = (location: string, country?: string, remote: JobFeatures["remote"] = "onsite") =>
    deepFreeze(makeJob({ location, country, remote }, { requiredSkills: ["SQL"] }));
  const livingIn = (location?: string) => deepFreeze(makeCV({ contact: { ...cv.contact, location } }));

  it("treats remote jobs as met and remote only preferences against on site jobs as missing", () => {
    expect(loc(cv, at("Perth WA", "AU", "remote"))).toMatchObject({ status: "met", earned: 10 });
    expect(loc(cv, at("Melbourne VIC", "AU", "onsite"), { remoteOnly: true })).toMatchObject({ status: "missing" });
  });

  it("compares cities and countries", () => {
    expect(loc(cv, at("Melbourne, Victoria"))).toMatchObject({ status: "met" });
    expect(loc(cv, at("Sydney NSW"))).toMatchObject({ status: "partial", earned: 5 });
    expect(loc(cv, at("London", "GB"))).toMatchObject({ status: "missing" });
    expect(loc(cv, at("Australia", undefined))).toMatchObject({ status: "met" });
    expect(loc(cv, at("", undefined))).toMatchObject({ status: "not_applicable" });
  });

  it("uses preferences before the CV location", () => {
    expect(loc(cv, at("Sydney NSW"), { location: "Sydney" })).toMatchObject({ status: "met" });
    expect(loc(livingIn(undefined), at("Sydney NSW"), { country: "au" })).toMatchObject({ status: "partial" });
  });

  it("asks the candidate to state a location when none is known", () => {
    const r = scoreMatch(livingIn(undefined), at("Sydney NSW"), undefined, NOW);
    const c = byKey(r.criteria, "location");
    expect(c).toMatchObject({ status: "missing", earned: 0 });
    expect(c.note).toContain("State your city and country");
    const clarify = r.suggestions.find((s) => s.kind === "clarify" && s.action.includes("city and country"));
    expect(clarify?.action).toContain("up to");
    const ceiling = scoreMatch(livingIn("Sydney NSW"), at("Sydney NSW"), undefined, NOW).score - r.score;
    expect(clarify?.gain).toBe(ceiling);
  });
});

describe("suggestions", () => {
  const job = deepFreeze(makeJob({}, { requiredSkills: ["SQL", "Tableau", "Salesforce", "Terraform"], minYears: 3, roleFamily: "data-analyst" }));

  it("measures each add evidence gain by re-scoring a CV that differs by that one skill", () => {
    const base = scoreMatch(cv, job, undefined, NOW);
    const evidence = base.suggestions.filter((s) => s.kind === "add_evidence");
    expect(evidence).toHaveLength(3);
    for (const s of evidence) {
      const skill = base.missingSkills.find((m) => s.action.includes(`used ${m} in a role`));
      expect(skill).toBeDefined();
      expect(s.gain).toBe(scoreMatch(evidenced(cv, skill as string), job, undefined, NOW).score - base.score);
      expect(s.gain).toBeGreaterThan(0);
    }
    expect(evidence[0].action).toBe("If you have used Tableau in a role, add a bullet that shows where and what it achieved.");
  });

  it("adds learn hints for the top missing skills, sorts by gain and caps at six", () => {
    const wide = deepFreeze(makeJob({}, { requiredSkills: ["SQL", "Tableau", "Salesforce", "Terraform", "AWS", "React", "TypeScript"], roleFamily: "data-analyst" }));
    const r = scoreMatch(cv, wide, undefined, NOW);
    expect(r.suggestions.length).toBeLessThanOrEqual(6);
    const gains = r.suggestions.map((s) => s.gain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
    const learn = scoreMatch(cv, job, undefined, NOW).suggestions.filter((s) => s.kind === "learn");
    expect(learn.map((s) => s.action)).toEqual([learnHint("Tableau"), learnHint("Salesforce")]);
  });

  it("asks for dates on undated roles with an honest ceiling", () => {
    const undated = deepFreeze(makeCV({ yearsExperience: null, experience: [{ title: "Data Analyst", employer: "Quillfeather Analytics", evidenceIds: ["E2"] }] }));
    const r = scoreMatch(undated, job, undefined, NOW);
    const clarify = r.suggestions.find((s) => s.kind === "clarify" && s.action.startsWith("Add a start and end"));
    const dated = deepFreeze({ ...undated, yearsExperience: 3 });
    expect(clarify?.gain).toBe(scoreMatch(dated, job, undefined, NOW).score - r.score);
    expect(clarify?.action).toContain("up to");
  });

  it("never suggests anything when nothing is missing", () => {
    const easy = deepFreeze(makeJob({}, { requiredSkills: ["SQL"], roleFamily: "data-analyst" }));
    expect(scoreMatch(cv, easy, undefined, NOW).suggestions).toEqual([]);
  });
});

describe("explanation, eligibility and timing", () => {
  it("explains in plain sentences", () => {
    const job = deepFreeze(makeJob({}, { requiredSkills: ["SQL", "Tableau"], minYears: 3, roleFamily: "data-analyst" }));
    expect(scoreMatch(cv, job, undefined, NOW).explanation).toBe(
      "Matches 1 of 2 required skills, including SQL. Experience meets the 3 year minimum.",
    );
    const senior = deepFreeze(makeJob({}, { requiredSkills: ["SQL", "Power BI", "Tableau"], minYears: 6, roleFamily: "data-analyst" }));
    expect(scoreMatch(cv, senior, undefined, NOW).explanation).toBe(
      "Matches 2 of 3 required skills, including SQL and Power BI. Experience is below the 6 year minimum.",
    );
  });

  it("never names the company, even when the title carries it", () => {
    for (const roleFamilyId of ["data-analyst", null]) {
      const job = deepFreeze(makeJob({ title: "Data Analyst, Northwind Telecom" }, { requiredSkills: ["SQL", "Tableau"], roleFamily: roleFamilyId }));
      const r = scoreMatch(deepFreeze(makeCV({ contact: { links: [] } })), job, undefined, NOW);
      for (const text of [r.explanation, r.timing.label, ...r.criteria.map((c) => c.note), ...r.suggestions.map((s) => s.action)]) {
        expect(text).not.toMatch(/northwind|telecom/i);
      }
    }
  });

  it("copies eligibility bars and never lets them change the score", () => {
    const bars = [
      { kind: "citizenship" as const, text: "You must be an Australian citizen." },
      { kind: "security_clearance" as const, text: "An NV1 clearance is required." },
    ];
    const barred = deepFreeze(makeJob({}, { ...fullJob.requirements, eligibility: bars }));
    const open = scoreMatch(cv, fullJob, undefined, NOW);
    const r = scoreMatch(cv, barred, { hasWorkRights: false }, NOW);
    expect(r.eligibility).toEqual(bars);
    expect(r.eligibility[0]).not.toBe(bars[0]);
    expect(r.score).toBe(open.score);
    expect(r.criteria).toEqual(open.criteria);
  });

  it("labels timing in whole days and never scores it", () => {
    const t = (postedAt?: string, closesAt?: string) => scoreMatch(cv, deepFreeze(makeJob({ postedAt, closesAt }, fullJob.requirements)), undefined, NOW);
    expect(t("2026-09-24T08:00:00Z").timing).toEqual({ postedDaysAgo: 3, closesInDays: null, label: "Posted 3 days ago" });
    expect(t("2026-09-27T01:00:00Z").timing.label).toBe("Posted today");
    expect(t("2026-09-26T23:00:00Z").timing.label).toBe("Posted 1 day ago");
    expect(t(undefined, "2026-10-02").timing).toEqual({ postedDaysAgo: null, closesInDays: 5, label: "Posting date not stated, closes in 5 days" });
    expect(t("2026-09-20", "2026-09-27").timing.label).toBe("Posted 7 days ago, closes today");
    expect(t("2026-09-01", "2026-09-20").timing.label).toBe("Posted 26 days ago, closing date has passed");
    expect(t("not a date").timing.postedDaysAgo).toBeNull();
    expect(t("2026-10-30").timing.postedDaysAgo).toBe(0);
    expect(new Set([t().score, t("2026-01-01").score, t("2026-09-27", "2026-09-28").score]).size).toBe(1);
  });

  it("uses only clean, plain text", () => {
    const jobs = [
      fullJob,
      makeJob({ location: "Sydney NSW" }, { requiredSkills: ["SQL", "Tableau", "Salesforce"], minYears: 8, degree: "master" }),
      makeJob({ title: "Zeppelin Hangar Rigging Specialist", remote: "remote" }, { niceSkills: ["Tableau"] }),
    ];
    const cvs = [cv, makeCV({ contact: { links: [] }, yearsExperience: null, education: [] })];
    for (const job of jobs) {
      for (const c of cvs) {
        for (const text of generatedStrings(scoreMatch(c, job, undefined, NOW))) expect(textViolations(text), text).toEqual([]);
      }
    }
  });
});

describe("score bounds and bands", () => {
  it("always returns an integer from 0 to 100 with a matching band", () => {
    const skills = ["SQL", "Power BI", "Tableau", "Salesforce", "Terraform", "AWS"];
    for (let i = 0; i < 64; i++) {
      const job = makeJob(
        { remote: i % 3 === 0 ? "remote" : "onsite", location: i % 2 ? "Sydney NSW" : "Melbourne VIC" },
        {
          requiredSkills: skills.slice(0, (i % 6) + 1),
          niceSkills: skills.slice(i % 4),
          minYears: i % 5 === 0 ? null : i % 9,
          degree: i % 4 === 0 ? null : "master",
          roleFamily: i % 2 ? "data-analyst" : null,
        },
      );
      const r = scoreMatch(cv, job, undefined, NOW);
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.band).toBe(band(r.score));
      expect(r.score).toBe(recompute(r.criteria));
    }
  });

  it("maps bands at their thresholds", () => {
    expect([band(100), band(75), band(74), band(60), band(59), band(40), band(39), band(0)]).toEqual([
      "strong", "strong", "good", "good", "stretch", "stretch", "low", "low",
    ]);
  });

  it("rejects an invalid now", () => {
    expect(() => scoreMatch(cv, fullJob, undefined, new Date("nope"))).toThrow(RangeError);
  });
});

describe("rankMatches", () => {
  it("sorts by score, then most recent posting, without mutating the input", () => {
    const jobs = deepFreeze([
      makeJob({ id: "weak", postedAt: "2026-09-26" }, { requiredSkills: ["Salesforce", "Terraform"], roleFamily: "data-analyst" }),
      makeJob({ id: "tie-old", postedAt: "2026-09-01" }, { requiredSkills: ["SQL"], roleFamily: "data-analyst" }),
      makeJob({ id: "tie-undated" }, { requiredSkills: ["SQL"], roleFamily: "data-analyst" }),
      makeJob({ id: "tie-new", postedAt: "2026-09-20" }, { requiredSkills: ["SQL"], roleFamily: "data-analyst" }),
    ]);
    const ranked = rankMatches(cv, jobs, undefined, NOW);
    expect(ranked.map((r) => r.jobId)).toEqual(["tie-new", "tie-old", "tie-undated", "weak"]);
    expect(jobs.map((j) => j.id)).toEqual(["weak", "tie-old", "tie-undated", "tie-new"]);
  });

  it("returns an empty list for no jobs", () => {
    expect(rankMatches(cv, [], undefined, NOW)).toEqual([]);
  });
});
