// Synthetic, fictional test data only. No real person, employer or contact detail.
import type { Evidence, JobFeatures, JobPosting, JobRequirements, ParsedCV } from "@/lib/types";

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function makeRequirements(overrides: Partial<JobRequirements> = {}): JobRequirements {
  return {
    requiredSkills: [],
    niceSkills: [],
    minYears: null,
    degree: null,
    seniority: null,
    eligibility: [],
    roleFamily: null,
    ...overrides,
  };
}

export function makeJob(overrides: Partial<JobFeatures> = {}, req: Partial<JobRequirements> = {}): JobFeatures {
  return {
    id: "manual-test-1",
    title: "Data Analyst",
    location: "Melbourne VIC",
    country: "AU",
    remote: "onsite",
    skills: [],
    requirements: makeRequirements(req),
    status: "open",
    ...overrides,
  };
}

export function makePosting(overrides: Partial<JobPosting> = {}, req: Partial<JobRequirements> = {}): JobPosting {
  return {
    ...makeJob({}, req),
    source: "manual",
    sourceId: "1",
    company: "Northwind Telecom",
    description: "A synthetic advert.",
    url: "https://example.com/jobs/1",
    applyUrl: "https://example.com/jobs/1/apply",
    retrievedAt: "2026-09-01T00:00:00Z",
    lastCheckedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const JORDAN_EVIDENCE: Evidence[] = [
  { id: "E1", section: "summary", text: "Data analyst with four years of reporting experience in telecommunications." },
  { id: "E2", section: "experience", text: "Built Power BI dashboards used by 40 regional managers.", employer: "Quillfeather Analytics", role: "Data Analyst" },
  { id: "E3", section: "experience", text: "Wrote SQL queries that cut month end reporting time by 30%.", employer: "Quillfeather Analytics", role: "Data Analyst" },
  { id: "E4", section: "experience", text: "Automated data validation checks in Python for stakeholder reporting.", employer: "Harbourline Logistics", role: "Reporting Analyst" },
  { id: "E5", section: "education", text: "Bachelor of Commerce, Kestrel Bay University" },
  { id: "E6", section: "skills", text: "SQL, Power BI, Python, Excel" },
];

/** A well formed data analyst CV for Jordan Avery, a fictional candidate. */
export function makeCV(overrides: Partial<ParsedCV> = {}): ParsedCV {
  return {
    contact: {
      name: "Jordan Avery",
      email: "jordan.avery@example.com",
      phone: "0400 000 123",
      location: "Melbourne VIC",
      links: ["https://www.linkedin.com/in/jordan-avery-example"],
    },
    summary: "Data analyst with four years of reporting experience in telecommunications.",
    experience: [
      { title: "Data Analyst", employer: "Quillfeather Analytics", start: "2023-02", end: "present", evidenceIds: ["E2", "E3"] },
      { title: "Reporting Analyst", employer: "Harbourline Logistics", start: "2021-01", end: "2023-01", evidenceIds: ["E4"] },
    ],
    education: [{ institution: "Kestrel Bay University", qualification: "Bachelor of Commerce", end: "2020-11", evidenceId: "E5" }],
    projects: [],
    certifications: [],
    skills: ["SQL", "Power BI", "Python", "Excel"],
    skillEvidence: { SQL: ["E3", "E6"], "Power BI": ["E2", "E6"], Python: ["E4", "E6"], Excel: ["E6"] },
    evidence: JORDAN_EVIDENCE,
    yearsExperience: 4,
    wordCount: 420,
    rawSections: {
      summary: "Data analyst with four years of reporting experience in telecommunications.",
      experience: "Data Analyst, Quillfeather Analytics, Feb 2023 to Present\nReporting Analyst, Harbourline Logistics, Jan 2021 to Jan 2023",
      skills: "SQL, Power BI, Python, Excel",
    },
    warnings: [],
    ...overrides,
  };
}

const BANNED = [
  "i am excited to", "thrilled", "passionate about", "leverage", "delve", "in today's fast-paced",
  "proven track record", "dynamic", "synergy", "spearheaded", "seamless", "robust", "cutting-edge",
  "game-changer", "unlock", "elevate", "embark", "journey", "testament", "i hope this finds you well",
];

/** Returns the rule each user facing string breaks, empty when the text is clean. */
export function textViolations(text: string): string[] {
  const out: string[] = [];
  if (/[–—]/.test(text)) out.push("dash");
  if (text.includes(";")) out.push("semicolon");
  if (text.includes("!")) out.push("exclamation");
  if (/ {2}/.test(text)) out.push("double space");
  if (text.includes("**")) out.push("bold");
  if (/:(?!\/\/)/.test(text.replace(/\b\d{1,2}:\d{2}\b/g, ""))) out.push("colon");
  if (/\p{Extended_Pictographic}/u.test(text)) out.push("emoji");
  const lower = text.toLowerCase();
  for (const phrase of BANNED) if (lower.includes(phrase)) out.push(`phrase ${phrase}`);
  return out;
}
