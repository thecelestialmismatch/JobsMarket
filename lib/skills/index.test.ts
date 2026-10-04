import { describe, expect, it } from "vitest";
import { classifyTitle, extractSkills, learnHint, roleFamily, ROLE_FAMILIES, SKILLS } from "./index";

describe("taxonomy integrity", () => {
  it("has at least 250 skills and 40 role families with unique names", () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(250);
    expect(ROLE_FAMILIES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SKILLS.map((s) => s.name)).size).toBe(SKILLS.length);
    expect(new Set(ROLE_FAMILIES.map((f) => f.id)).size).toBe(ROLE_FAMILIES.length);
  });

  it("only references canonical skills from families and implies", () => {
    const names = new Set(SKILLS.map((s) => s.name));
    for (const f of ROLE_FAMILIES) for (const s of f.coreSkills) expect(names.has(s), `${f.id} ${s}`).toBe(true);
    for (const s of SKILLS) for (const p of s.implies ?? []) expect(names.has(p), `${s.name} implies ${p}`).toBe(true);
  });

  it("keeps learning hints free of banned punctuation", () => {
    for (const s of SKILLS) expect(learnHint(s.name)).not.toMatch(/[–—;:!]/);
  });
});

describe("extractSkills precision", () => {
  it.each([
    "Excellent communication and going forward we react quickly.",
    "Our R&D team will swiftly spark joy and go live in March.",
    "We value networking events, guard rails and art collections.",
    "I excel at building rapport with customers.",
  ])("finds no tech skills in %s", (text) => {
    expect(extractSkills(text)).toEqual([]);
  });
});

describe("extractSkills recall", () => {
  it("matches aliases and exact symbols", () => {
    const got = extractSkills("PowerBI, T-SQL, k8s, GH Actions, MS Excel, C# and C++ with Golang and RStudio");
    expect(got).toEqual(expect.arrayContaining(["Power BI", "SQL", "Kubernetes", "GitHub Actions", "Excel", "C#", "C++", "Go", "R"]));
  });

  it("credits implied parents", () => {
    expect(extractSkills("Built AWS Lambda functions")).toEqual(expect.arrayContaining(["AWS Lambda", "AWS"]));
    expect(extractSkills("Shipped a Next.js app")).toEqual(expect.arrayContaining(["Next.js", "React"]));
    expect(extractSkills("Automated with Power Query")).toEqual(expect.arrayContaining(["Power Query", "Excel"]));
  });

  it("is fast enough for bulk ingestion", () => {
    const advert = "We need SQL, Power BI, Python and stakeholder management. ".repeat(250);
    extractSkills(advert);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) extractSkills(advert);
    expect((performance.now() - t0) / 20).toBeLessThan(25);
  });
});

describe("classifyTitle", () => {
  it.each([
    ["Sr. Data Analyst - Melbourne (Hybrid)", "data-analyst"],
    ["Senior Reporting Analyst", "data-analyst"],
    ["Power BI Developer", "bi-developer"],
    ["Analytics Engineer", "data-engineer"],
    ["Full Stack Developer", "software-engineer"],
    ["Frontend Engineer | Remote", "frontend-engineer"],
    ["Amazon Connect Engineer", "contact-centre-engineer"],
    ["Cloud Engineer at Kestrel", "cloud-engineer"],
    ["Site Reliability Engineer", "devops-engineer"],
    ["SOC Analyst Level 2", "security-analyst"],
    ["Service Desk Analyst", "it-support"],
    ["IT Support Officer", "it-support"],
    ["Customer Experience Team Leader", "cx-team-leader"],
    ["Head of Customer Experience", "cx-team-leader"],
    ["Business Analyst", "business-analyst"],
    ["Junior Project Coordinator", "project-manager"],
    ["Product Owner", "product-manager"],
    ["Senior Product Designer", "ux-designer"],
    ["Digital Marketing Manager", "digital-marketer"],
    ["Key Account Manager", "account-manager"],
    ["Assistant Accountant", "accountant"],
    ["FP&A Analyst", "finance-analyst"],
    ["Accounts Payable Officer", "accounts-officer"],
    ["Talent Acquisition Specialist", "recruiter"],
    ["Medical Receptionist", "health-admin"],
    ["Executive Assistant", "office-admin"],
  ])("%s is %s", (title, id) => {
    expect(classifyTitle(title)).toBe(id);
  });

  it("returns null for unrelated titles", () => {
    expect(classifyTitle("Pastry Chef")).toBeNull();
    expect(classifyTitle("")).toBeNull();
    expect(roleFamily("data-analyst")?.label).toBe("Data Analyst");
  });
});
