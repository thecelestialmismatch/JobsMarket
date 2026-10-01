import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCv } from "./parse";

interface Expected {
  name: string;
  email: string;
  phone: string;
  location: string;
  experience: { title: string; employer: string; start: string; end: string; bullets: number }[];
  educationCount: number;
  skills: string[];
  yearsExperience: number;
}

const DIR = path.join(__dirname, "__fixtures__");
const NOW = new Date("2026-10-01T00:00:00Z");
const FIXTURES = ["jordan-avery", "sam-okafor", "priya-nair", "messy"];

function load(name: string) {
  const text = readFileSync(path.join(DIR, `${name}.txt`), "utf8");
  const expected = JSON.parse(readFileSync(path.join(DIR, `${name}.json`), "utf8")) as Expected;
  return { cv: parseCv(text, { now: NOW }), expected };
}

describe("parseCv accuracy across synthetic fixtures", () => {
  it("gets at least 90% of fields right overall, and every email and employer exactly", () => {
    let right = 0;
    let total = 0;
    const check = (ok: boolean) => {
      total += 1;
      if (ok) right += 1;
    };
    for (const name of FIXTURES) {
      const { cv, expected } = load(name);
      expect(cv.contact.email, `${name} email`).toBe(expected.email);
      check(cv.contact.name === expected.name);
      check(cv.contact.email === expected.email);
      check((cv.contact.phone ?? "").replace(/\s/g, "") === expected.phone.replace(/\s/g, ""));
      check(cv.contact.location === expected.location);
      check(cv.education.length === expected.educationCount);
      expected.experience.forEach((x, i) => {
        const got = cv.experience[i];
        expect(got?.employer, `${name} employer ${i}`).toBe(x.employer);
        check(got?.title === x.title);
        check(got?.start === x.start);
        check(got?.end === x.end);
        check(got?.evidenceIds.length === x.bullets);
      });
      for (const s of expected.skills) check(cv.skills.includes(s));
      check(Math.abs((cv.yearsExperience ?? 0) - expected.yearsExperience) <= 0.3);
    }
    expect(right / total).toBeGreaterThanOrEqual(0.9);
  });
});

describe("parseCv ledger", () => {
  const { cv } = load("jordan-avery");

  it("numbers evidence sequentially and uniquely", () => {
    expect(cv.evidence.map((e) => e.id)).toEqual(cv.evidence.map((_, i) => `E${i + 1}`));
  });

  it("keeps skillEvidence consistent with the evidence text", () => {
    const byId = new Map(cv.evidence.map((e) => [e.id, e.text.toLowerCase()]));
    for (const [skill, ids] of Object.entries(cv.skillEvidence)) {
      for (const id of ids) expect(byId.has(id), `${skill} ${id}`).toBe(true);
    }
  });

  it("attaches employer and role to experience bullets", () => {
    const bullet = cv.evidence.find((e) => e.section === "experience");
    expect(bullet?.employer).toBe("Northwind Telecom");
    expect(bullet?.role).toBe("Senior Reporting Analyst");
  });

  it("never turns referee details into evidence", () => {
    const text = "Alex Lee\nalex@example.com\n\nEXPERIENCE\nAnalyst\nAcme Pty Ltd\nJan 2020 to Present\n• Built reports in SQL.\n\nREFERENCES\nDana Smith, Manager, dana@example.com, 0400 111 222";
    const parsed = parseCv(text, { now: NOW });
    expect(parsed.evidence.some((e) => /dana/i.test(e.text))).toBe(false);
    expect(parsed.contact.email).toBe("alex@example.com");
  });

  it("warns about missing contact details and roles", () => {
    const parsed = parseCv("Just some words about me and my interests in data.", { now: NOW });
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.yearsExperience).toBeNull();
  });
});
