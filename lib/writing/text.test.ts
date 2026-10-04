import { describe, expect, it } from "vitest";
import {
  cleanEvidence,
  cleanLabel,
  coreTitle,
  formatThousands,
  joinList,
  numbersIn,
  startsWithPastTense,
  stripForColon,
} from "./text";

describe("numbersIn", () => {
  it("normalises thousands separators, percentages and decimals", () => {
    expect(numbersIn("Cut costs 30% across 1,200 sites and saved $95,000 in 2.5 years")).toEqual([
      "30",
      "1200",
      "95000",
      "2.5",
    ]);
  });
  it("ignores digits inside skill names, links, emails and phone numbers", () => {
    expect(numbersIn("Used S3 and EC2 with Python3")).toEqual([]);
    expect(numbersIn("github.com/sam99 | sam.okafor2@example.com | 0400 000 123")).toEqual([]);
  });
  it("keeps short digit groups that are not phone numbers", () => {
    expect(numbersIn("Managed 12 staff from 2019 to 2021")).toEqual(["12", "2019", "2021"]);
  });
});

describe("stripForColon", () => {
  it("removes urls, emails and clock times", () => {
    const out = stripForColon("See https://example.com at 9:30 or mail jordan@example.com");
    expect(out).not.toContain(":");
  });
});

describe("cleanEvidence", () => {
  it("strips bullets, ampersands and connector dashes", () => {
    expect(cleanEvidence("  • Built reports in SQL & Python – adopted by 3 teams ")).toBe(
      "Built reports in SQL and Python, adopted by 3 teams",
    );
  });
  it("turns a dash between dates into 'to'", () => {
    expect(cleanEvidence("Delivered upgrades 2019–2021")).toBe("Delivered upgrades 2019 to 2021");
    expect(cleanEvidence("Contract role Mar 2019 - Present")).toBe("Contract role Mar 2019 to Present");
  });
  it("replaces semicolons with ', and' or a sentence split", () => {
    expect(cleanEvidence("Automated reports; cut preparation time")).toBe("Automated reports, and cut preparation time");
    expect(cleanEvidence("Automated reports; Cut preparation time")).toBe("Automated reports. Cut preparation time");
    expect(cleanEvidence("Automated reports; and cut time;")).toBe("Automated reports, and cut time");
  });
  it("keeps hyphenated words and collapses double spaces", () => {
    expect(cleanEvidence("Ran full-stack  T-SQL -- reviews")).toBe("Ran full-stack T-SQL, reviews");
  });
});

describe("labels and titles", () => {
  it("cleans colons out of labels", () => {
    expect(cleanLabel("Churn model: telecom")).toBe("Churn model, telecom");
  });
  it("reduces a job title to its core", () => {
    expect(coreTitle("Data Analyst - 12 month contract")).toBe("Data Analyst");
    expect(coreTitle("Senior Engineer (Payments)")).toBe("Senior Engineer");
    expect(coreTitle("Logistics Coordinator")).toBe("Logistics Coordinator");
  });
});

describe("small helpers", () => {
  it("detects past tense openers", () => {
    expect(startsWithPastTense("Built a dashboard")).toBe(true);
    expect(startsWithPastTense("Reduced costs")).toBe(true);
    expect(startsWithPastTense("Need to hire")).toBe(false);
    expect(startsWithPastTense("Dashboard adopted by teams")).toBe(false);
  });
  it("formats thousands and joins lists", () => {
    expect(formatThousands(110000)).toBe("110,000");
    expect(formatThousands(95000.5)).toBe("95,000.5");
    expect(joinList(["SQL"])).toBe("SQL");
    expect(joinList(["SQL", "Excel", "Python"])).toBe("SQL, Excel and Python");
  });
});
