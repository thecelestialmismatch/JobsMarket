import { describe, expect, it } from "vitest";
import { classifyTitle } from "@/lib/skills";
import { analyzeJob } from "./requirements";

const kinds = (title: string, description: string) => analyzeJob({ title, description }).eligibility.map((b) => b.kind);

describe("analyzeJob on synthetic adverts", () => {
  it("reads a bulleted data analyst advert with a nice to have section", () => {
    const r = analyzeJob({
      title: "Data Analyst",
      description: [
        "Northwind Telecom is hiring a Data Analyst to support network planning.",
        "About you:",
        "- 3+ years of experience in a reporting role",
        "- Strong SQL and Power BI skills",
        "- Advanced Excel",
        "- Bachelor's degree in a quantitative field or equivalent experience",
        "Nice to have:",
        "- Tableau",
        "- Exposure to telecommunications data",
        "What we offer:",
        "- Hybrid work, 2 days in office",
        "You must have full working rights in Australia and pass a national police check.",
      ].join("\n"),
    });
    expect(r.requiredSkills).toEqual(expect.arrayContaining(["SQL", "Power BI", "Excel"]));
    expect(r.requiredSkills).not.toContain("Tableau");
    expect(r.niceSkills).toContain("Tableau");
    expect(r.minYears).toBe(3);
    expect(r.degree).toBe("bachelor");
    expect(r.seniority).toBe("mid");
    expect(r.roleFamily).toBe("data-analyst");
    expect(r.eligibility.map((b) => b.kind)).toEqual(["work_rights", "license"]);
    expect(r.eligibility[0].text).toBe("You must have full working rights in Australia and pass a national police check.");
  });

  it("reads a senior engineering advert and ignores numbers that are not experience", () => {
    const r = analyzeJob({
      title: "Senior Software Engineer",
      description: [
        "Quillfeather Analytics builds forecasting tools for retailers.",
        "You will have at least five years of commercial experience with TypeScript and React.",
        "Experience with AWS would be great. Terraform is a bonus.",
        "We offer 401k matching, 2 days in office and 20 days of leave.",
        "Sponsorship is not available for this role.",
      ].join("\n"),
    });
    expect(r.requiredSkills).toEqual(expect.arrayContaining(["TypeScript", "React"]));
    expect(r.niceSkills).toEqual(expect.arrayContaining(["AWS", "Terraform"]));
    expect(r.requiredSkills).not.toContain("AWS");
    expect(r.minYears).toBe(5);
    expect(r.degree).toBeNull();
    expect(r.seniority).toBe("senior");
    expect(r.roleFamily).toBe("software-engineer");
    expect(r.eligibility).toEqual([{ kind: "work_rights", text: "Sponsorship is not available for this role." }]);
  });

  it("reads a graduate advert with a range, a citizenship bar and a clearance", () => {
    const r = analyzeJob({
      title: "Graduate Data Analyst",
      description: [
        "Join the Harbourline Logistics graduate program.",
        "0-1 years of experience with SQL is fine.",
        "A Bachelor's or Master's degree in statistics or economics.",
        "You must be an Australian citizen and able to obtain a Baseline security clearance.",
        "An NV1 clearance is not needed at the start.",
      ].join("\n"),
    });
    expect(r.minYears).toBe(0);
    expect(r.degree).toBe("bachelor");
    expect(r.seniority).toBe("junior");
    expect(r.eligibility.map((b) => b.kind)).toEqual(["citizenship", "security_clearance"]);
  });

  it("takes the largest floor across ranges and deduplicates clearance bars", () => {
    const r = analyzeJob({
      title: "Lead Platform Engineer",
      description: [
        "3-5 years of experience running AWS platforms, including a minimum of 2 years with Terraform.",
        "A degree in computer science or a related field.",
        "A Master's degree is desirable.",
        "An NV1 clearance is required. Candidates must hold current AGSVA clearance.",
      ].join("\n"),
    });
    expect(r.minYears).toBe(3);
    expect(r.degree).toBe("bachelor");
    expect(r.seniority).toBe("lead");
    expect(r.eligibility.map((b) => b.kind)).toEqual(["security_clearance"]);
    expect(r.eligibility[0].text).toBe("An NV1 clearance is required.");
  });

  it("keeps a nice section open across lines that have lost their bullet markers", () => {
    const r = analyzeJob({
      title: "Reporting Analyst",
      description: [
        "Harbourline Logistics is growing its reporting team.",
        "Requirements",
        "Strong SQL skills",
        "Experience with Power BI",
        "Desirable",
        "Experience with Tableau",
        "Exposure to Python",
        "What we offer",
        "Flexible hours and a friendly team",
      ].join("\n"),
    });
    expect(r.requiredSkills).toEqual(expect.arrayContaining(["SQL", "Power BI"]));
    expect(r.niceSkills).toEqual(expect.arrayContaining(["Tableau", "Python"]));
    expect(r.requiredSkills).not.toContain("Tableau");
    expect(r.requiredSkills).not.toContain("Python");
    expect(r.minYears).toBeNull();
    expect(r.seniority).toBeNull();
    expect(r.eligibility).toEqual([]);
  });

  it("reads word numbers with a bracketed digit, licences and residency, and a negated degree", () => {
    const title = "Salesforce Administrator";
    const r = analyzeJob({
      title,
      description: [
        "We have been operating for 25 years across three states.",
        "You will have at least three (3) years of experience administering CRM platforms.",
        "Two years of hands-on Salesforce configuration.",
        "No degree required.",
        "Candidates must be over 18 years old.",
        "A current driver's licence and a Working with Children Check (WWCC) are required.",
        "Applicants must be Australian permanent residents.",
      ].join("\n"),
    });
    expect(r.requiredSkills).toContain("Salesforce");
    expect(r.minYears).toBe(3);
    expect(r.degree).toBeNull();
    expect(r.seniority).toBe("mid");
    expect(r.roleFamily).toBe(classifyTitle(title));
    expect(r.eligibility.map((b) => b.kind)).toEqual(["license", "permanent_residency"]);
  });

  it("reads a principal advert with a PhD and gives the title seniority priority", () => {
    const r = analyzeJob({
      title: "Principal Data Scientist",
      description: "10+ years of experience in applied statistics. A PhD in statistics or a related field.",
    });
    expect(r.minYears).toBe(10);
    expect(r.degree).toBe("phd");
    expect(r.seniority).toBe("principal");
  });

  it("reads an internship with no experience or degree stated", () => {
    const r = analyzeJob({ title: "Data Science Intern", description: "Learn Python and SQL alongside our analysts." });
    expect(r.seniority).toBe("intern");
    expect(r.minYears).toBeNull();
    expect(r.degree).toBeNull();
    expect(r.requiredSkills).toEqual(expect.arrayContaining(["Python", "SQL"]));
  });
});

describe("analyzeJob details", () => {
  it("keeps a skill in both lists as required only", () => {
    const r = analyzeJob({ title: "Analyst", description: "SQL is essential.\nNice to have: SQL Server and Tableau." });
    expect(r.requiredSkills).toContain("SQL");
    expect(r.niceSkills).not.toContain("SQL");
    expect(r.niceSkills).toContain("Tableau");
  });

  it("splits clauses on strong connectors", () => {
    const r = analyzeJob({
      title: "Analyst",
      description: "Strong SQL skills are essential; Tableau would be great.\nPython, ideally with AWS.",
    });
    expect(r.requiredSkills).toEqual(expect.arrayContaining(["SQL", "Python"]));
    expect(r.niceSkills).toEqual(expect.arrayContaining(["Tableau", "AWS"]));
  });

  it("treats the preferred candidate phrasing as required", () => {
    const r = analyzeJob({ title: "Analyst", description: "The preferred candidate will have Python experience." });
    expect(r.requiredSkills).toContain("Python");
  });

  it("counts skills named in the title as required", () => {
    expect(analyzeJob({ title: "Tableau Developer", description: "Build reports." }).requiredSkills).toContain("Tableau");
  });

  it("does not negate a degree because another clause says no", () => {
    const r = analyzeJob({ title: "Analyst", description: "No sponsorship is available and a degree in IT is required." });
    expect(r.degree).toBe("bachelor");
    expect(r.eligibility.map((b) => b.kind)).toEqual(["work_rights"]);
  });

  it("ignores degree phrases that are not qualifications", () => {
    const r = analyzeJob({ title: "Analyst", description: "You will run 360 degree feedback with a high degree of autonomy." });
    expect(r.degree).toBeNull();
  });

  it("ignores time frames and years mentioned only in nice sentences", () => {
    expect(analyzeJob({ title: "Analyst", description: "Within 2 years you will gain experience leading a team." }).minYears).toBeNull();
    expect(analyzeJob({ title: "Analyst", description: "Nice to have: 4 years of experience in retail." }).minYears).toBeNull();
    expect(analyzeJob({ title: "Analyst", description: "Minimum of 2 years in a similar role." }).minYears).toBe(2);
  });

  it("maps years to seniority when the title is silent", () => {
    const at = (n: number) => analyzeJob({ title: "Analyst", description: `${n}+ years of experience.` }).seniority;
    expect([at(1), at(2), at(4), at(5), at(7), at(8)]).toEqual(["junior", "mid", "mid", "senior", "senior", "lead"]);
    expect(analyzeJob({ title: "Junior Analyst", description: "8 years of experience." }).seniority).toBe("junior");
  });

  it("does not read corporate citizenship as a citizenship bar", () => {
    expect(kinds("Analyst", "We take corporate citizenship seriously.")).toEqual([]);
  });

  it("returns empty requirements for an empty advert", () => {
    expect(analyzeJob({ title: "", description: "" })).toEqual({
      requiredSkills: [],
      niceSkills: [],
      minYears: null,
      degree: null,
      seniority: null,
      eligibility: [],
      roleFamily: null,
    });
  });

  it("rejects input that is not text", () => {
    expect(() => analyzeJob({ title: "Analyst", description: 42 } as unknown as { title: string; description: string })).toThrow(TypeError);
    expect(() => analyzeJob(null as unknown as { title: string; description: string })).toThrow(TypeError);
  });
});
