// CV text to ParsedCV. Sections are parsed in document order against one ledger, so evidence ids
// run E1, E2, ... down the page. Referee details never reach the evidence, the contact search or the skills.
import type { EducationEntry, Evidence, ExperienceEntry, ParsedCV, ProjectEntry } from "@/lib/types";
import { extractSkills } from "@/lib/skills";
import { mergedMonths } from "./dates";
import { parseEducation } from "./education";
import { parseExperience } from "./experience";
import { parseProjects, parseSummary, recordLines } from "./blocks";
import { extractContact, type Contact } from "./contact";
import { createLedger, type Ledger } from "./ledger";
import { MAX_TEXT_CHARS } from "./limits";
import { countWords, isBodyLine, normaliseText } from "./normalise";
import { splitSections, type Section } from "./sections";

interface Parts {
  summary: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  certifications: string[];
}

const NO_PARTS: Parts = { summary: [], experience: [], education: [], projects: [], certifications: [] };

export const WARNINGS = {
  noEmail: "No email address was found. Add one to the contact details at the top of the CV.",
  noPhone: "No phone number was found. Add a mobile number to the contact details at the top of the CV.",
  noExperience: "No work experience section was found. Add a heading such as Work Experience above your roles.",
  noDates: "No dates were found for your roles. Add a start and end month to each role.",
} as const;

/** A header line that reads as prose rather than a name, title or contact line. */
function isHeaderProse(line: string): boolean {
  return isBodyLine(line) && !/[@|\t]/.test(line);
}

function parseSection(section: Section, ledger: Ledger): Partial<Parts> {
  switch (section.key) {
    case "header": {
      const prose = section.lines.filter(isHeaderProse);
      return prose.length ? { summary: [parseSummary(prose, ledger)] } : {};
    }
    case "summary":
      return { summary: [parseSummary(section.lines, ledger)] };
    case "experience":
      return { experience: parseExperience(section.lines, ledger) };
    case "education":
      return { education: parseEducation(section.lines, ledger) };
    case "projects":
      return { projects: parseProjects(section.lines, ledger) };
    case "certifications":
      return { certifications: recordLines(section.lines, ledger, "certification") };
    case "skills":
      recordLines(section.lines, ledger, "skills");
      return {};
    case "awards":
      recordLines(section.lines, ledger, "award");
      return {};
    case "volunteering":
      recordLines(section.lines, ledger, "other");
      return {};
    case "references":
      return {};
  }
}

function addParts(a: Parts, b: Partial<Parts>): Parts {
  return {
    summary: [...a.summary, ...(b.summary ?? [])],
    experience: [...a.experience, ...(b.experience ?? [])],
    education: [...a.education, ...(b.education ?? [])],
    projects: [...a.projects, ...(b.projects ?? [])],
    certifications: [...a.certifications, ...(b.certifications ?? [])],
  };
}

function rawSectionsOf(sections: Section[]): Record<string, string> {
  return sections
    .filter((s) => s.key !== "header")
    .reduce<Record<string, string>>((acc, s) => {
      const text = s.lines.join("\n");
      return { ...acc, [s.key]: acc[s.key] ? `${acc[s.key]}\n${text}` : text };
    }, {});
}

function skillEvidenceOf(evidence: Evidence[]): Record<string, string[]> {
  return evidence.reduce<Record<string, string[]>>((acc, e) => {
    const next = { ...acc };
    for (const skill of extractSkills(e.text)) next[skill] = [...(next[skill] ?? []), e.id];
    return next;
  }, {});
}

function yearsOf(experience: ExperienceEntry[], now: Date): number | null {
  const ranges = experience.flatMap((x) => (x.start && x.end ? [{ start: x.start, end: x.end }] : []));
  if (ranges.length === 0) return null;
  return Math.round((mergedMonths(ranges, now) / 12) * 10) / 10;
}

function warningsOf(contact: Contact, sections: Section[], experience: ExperienceEntry[]): string[] {
  const hasExperienceSection = sections.some((s) => s.key === "experience");
  return [
    ...(contact.email ? [] : [WARNINGS.noEmail]),
    ...(contact.phone ? [] : [WARNINGS.noPhone]),
    ...(hasExperienceSection ? [] : [WARNINGS.noExperience]),
    ...(experience.length > 0 && experience.every((x) => !x.start) ? [WARNINGS.noDates] : []),
  ];
}

export function parseCv(text: string, opts: { now?: Date } = {}): ParsedCV {
  const now = opts.now ?? new Date();
  const normalised = normaliseText(text.slice(0, MAX_TEXT_CHARS));
  const sections = splitSections(normalised.split("\n").filter((l) => l.trim() !== ""));
  const ledger = createLedger();
  const parts = sections.reduce((acc, s) => addParts(acc, parseSection(s, ledger)), NO_PARTS);
  const evidence = ledger.items();
  const headerLines = sections[0]?.key === "header" ? sections[0].lines : [];
  const bodyText = sections
    .filter((s) => s.key !== "header" && s.key !== "references")
    .flatMap((s) => s.lines)
    .join("\n");
  const contact = extractContact(headerLines, bodyText);
  const skillEvidence = skillEvidenceOf(evidence);
  const skills = extractSkills([headerLines.join("\n"), bodyText, ...evidence.map((e) => e.text)].join("\n"));
  return {
    contact,
    ...(parts.summary.length ? { summary: parts.summary.join(" ") } : {}),
    experience: parts.experience,
    education: parts.education,
    projects: parts.projects,
    certifications: parts.certifications,
    skills,
    skillEvidence,
    evidence,
    yearsExperience: yearsOf(parts.experience, now),
    wordCount: countWords(normalised),
    rawSections: rawSectionsOf(sections),
    warnings: warningsOf(contact, sections, parts.experience),
  };
}
