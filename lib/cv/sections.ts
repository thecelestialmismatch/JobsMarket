// Section heading detection and splitting of a normalised CV into its sections.
import { isBulletLine } from "./normalise";

export type SectionKey =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "awards"
  | "volunteering"
  | "references";

export interface Section {
  key: SectionKey | "header";
  lines: string[];
}

export interface Heading {
  key: SectionKey;
  /** Content that followed the heading on the same line, as in "Skills: SQL, Excel". */
  rest: string;
}

const SYNONYMS: Record<SectionKey, string[]> = {
  summary: [
    "summary", "profile", "professional summary", "about me", "career objective", "personal statement",
    "objective", "career summary", "professional profile", "personal profile", "executive summary", "about",
  ],
  experience: [
    "experience", "work experience", "professional experience", "employment history", "work history",
    "career history", "relevant experience", "employment", "employment experience", "professional history",
  ],
  education: [
    "education", "qualifications", "academic background", "education and training",
    "education and qualifications", "academic qualifications",
  ],
  skills: [
    "skills", "technical skills", "core skills", "key skills", "core competencies", "tools", "skills and tools",
    "technologies", "competencies", "key competencies", "skills summary", "tools and technologies",
  ],
  projects: ["projects", "selected projects", "personal projects", "key projects", "project experience"],
  certifications: [
    "certifications", "certificates", "licences", "licenses", "courses", "licences and certifications",
    "licenses and certifications", "certifications and licences", "certifications and licenses",
    "professional development", "training",
  ],
  awards: ["awards", "achievements", "honours", "honors", "awards and achievements", "honours and awards", "awards and honours"],
  volunteering: ["volunteering", "volunteer experience", "volunteer work", "community involvement", "community"],
  references: ["references", "referees"],
};

const HEADING_LOOKUP = new Map<string, SectionKey>(
  (Object.keys(SYNONYMS) as SectionKey[]).flatMap((key) => SYNONYMS[key].map((s) => [s, key] as const)),
);

// Only consulted for ALL CAPS or colon terminated lines, where the author clearly meant a heading.
const KEYWORDS: [RegExp, SectionKey][] = [
  [/experience|employment|work history|career history/, "experience"],
  [/education|qualification|academic/, "education"],
  [/skill|competenc|technolog/, "skills"],
  [/project/, "projects"],
  [/certif|licen[cs]e|course|training/, "certifications"],
  [/award|achievement|honou?r/, "awards"],
  [/volunteer|community/, "volunteering"],
  [/referee|reference/, "references"],
  [/summary|profile|objective/, "summary"],
];

function headingText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[&/]/g, " and ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAllCaps(s: string): boolean {
  return /[A-Z]/.test(s) && s === s.toUpperCase();
}

export function detectHeading(line: string): Heading | null {
  if (isBulletLine(line)) return null;
  const colon = line.indexOf(":");
  if (colon > 0) {
    const key = HEADING_LOOKUP.get(headingText(line.slice(0, colon)));
    if (key) return { key, rest: line.slice(colon + 1).trim() };
  }
  const text = line.trim();
  if (text.length > 45 || /[\d@|\t]/.test(text) || text.split(" ").length > 5) return null;
  const norm = headingText(text);
  const exact = HEADING_LOOKUP.get(norm);
  if (exact) return { key: exact, rest: "" };
  if (!(isAllCaps(text) || text.endsWith(":")) || norm.startsWith("key ")) return null;
  const hit = KEYWORDS.find(([re]) => re.test(norm));
  return hit ? { key: hit[1], rest: "" } : null;
}

// Inside these sections "Tools: SQL, Excel" is a line of the role, not a new skills section.
const INLINE_HEADING_BLOCKED = new Set<Section["key"]>(["experience", "projects", "volunteering"]);

/** Splits non-empty normalised lines into sections in document order. Text before the first heading is "header". */
export function splitSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { key: "header", lines: [] };
  for (const line of lines) {
    const heading = detectHeading(line);
    const blocked = heading !== null && heading.rest !== "" && INLINE_HEADING_BLOCKED.has(current.key);
    if (!heading || blocked) {
      current.lines.push(line);
      continue;
    }
    sections.push(current);
    current = { key: heading.key, lines: heading.rest ? [heading.rest] : [] };
  }
  sections.push(current);
  return sections;
}
