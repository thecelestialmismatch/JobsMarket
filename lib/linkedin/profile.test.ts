import { describe, expect, it } from "vitest";
import { auditProfile, readProfile } from "./profile";

const NOW = new Date("2026-10-01T00:00:00Z");

// Made up person. Layout follows a LinkedIn "Save to PDF" export: contact and skills first, then name, headline, location.
const EXPORT = `Contact
sam.example@example.com
www.linkedin.com/in/sam-okafor-4a1b2c3d (LinkedIn)
Top Skills
SQL
Power BI
Excel
Sam Okafor
Passionate driven professional
Melbourne, Victoria, Australia
Summary
Sam is a passionate team player who loves data and works hard every day.
Experience
Acme Analytics
Reporting Analyst
August 2024 - Present (2 years 2 months)
Melbourne, Victoria, Australia
Responsible for weekly dashboards.
Worked on data cleaning for the finance team.
Education
La Trobe University
Master of Information Technology
2022 - 2024`;

describe("readProfile", () => {
  const p = readProfile(EXPORT, NOW);
  it("takes name, headline and url from the export layout", () => {
    expect(p.name).toBe("Sam Okafor");
    expect(p.headline).toBe("Passionate driven professional");
    expect(p.url).toBe("www.linkedin.com/in/sam-okafor-4a1b2c3d");
  });
  it("keeps the about text", () => expect(p.about).toMatch(/^Sam is a passionate/));
});

describe("auditProfile", () => {
  const a = auditProfile(readProfile(EXPORT, NOW), NOW);
  const keys = a.flags.map((f) => f.key);
  it("flags filler, short headline, third person about and the hash url", () => {
    expect(keys).toEqual(expect.arrayContaining(["headline-filler", "headline-short", "about-short", "about-third-person", "about-filler", "url-default"]));
  });
  it("never scores what the PDF cannot show", () => {
    const missing = a.sections.filter((s) => s.status === "not-provided").map((s) => s.key);
    expect(missing).toEqual(expect.arrayContaining(["photo", "banner", "featured", "recommendations", "skills"]));
    expect(a.scored).toBe(a.sections.filter((s) => s.status !== "not-provided").length);
  });
  it("suggests a clean url from the name and keeps every rewrite lint clean", () => {
    expect(a.rewrites.find((r) => r.section === "url")?.text).toBe("linkedin.com/in/samokafor");
    expect(a.rewrites.find((r) => r.section === "headline")?.text).toMatch(/^Reporting Analyst \|/);
  });
  it("scores a bare headline and about lower than a strong one", () => {
    const good = auditProfile({ ...readProfile(EXPORT, NOW), headline: "Reporting Analyst | Turning finance data into weekly decisions with SQL, Power BI and Excel for retail and telco teams in Melbourne", about: Array(220).fill("I build dashboards for finance teams").join(" "), url: "www.linkedin.com/in/samokafor" }, NOW);
    expect(good.score).toBeGreaterThan(a.score);
  });
  it("says so when there is no headline", () => {
    const none = auditProfile({ ...readProfile(EXPORT, NOW), headline: undefined }, NOW);
    expect(none.flags.map((f) => f.key)).toContain("headline-missing");
  });
});

// Real exports wrap the headline over several lines and print certificates above the name.
const WRAPPED = `Contact
sam.example@example.com
www.linkedin.com/in/samokafor
(LinkedIn)
Top Skills
SQL
Certifications
Data Analytics Essentials
Project Management:
Foundations
Sam Okafor
Reporting analyst and data engineer | Turning finance data into
weekly decisions | SQL, Power BI, Excel | Retail and telco teams |
Available now
Melbourne, Victoria, Australia
Summary
I build dashboards for finance teams.
Experience
Acme Analytics
Reporting Analyst
August 2024 - Present (2 years 2 months)
Built weekly dashboards that cut reporting time 30%.`;

describe("readProfile on a wrapped headline", () => {
  it("joins the wrapped lines and ignores certificate titles above the name", () => {
    const p = readProfile(WRAPPED, NOW);
    expect(p.name).toBe("Sam Okafor");
    expect(p.headline).toMatch(/^Reporting analyst and data engineer \| Turning finance data into weekly decisions .* Available now$/);
    expect(p.url).toBe("www.linkedin.com/in/samokafor");
  });
});
