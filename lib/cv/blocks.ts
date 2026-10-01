// The simpler sections: summary paragraphs, projects, and line lists such as skills or certifications.
import type { EvidenceSection, ProjectEntry } from "@/lib/types";
import { isBodyLine, isBulletLine, joinContinuations, stripBullet } from "./normalise";
import type { Ledger } from "./ledger";

// ponytail: splits after . ! ? before a capital or digit, so "e.g. Excel" splits too. Swap in Intl.Segmenter with abbreviation suppression if that bites.
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z0-9])/;

export function sentences(text: string): string[] {
  return text.split(SENTENCE_BREAK).map((s) => s.trim()).filter(Boolean);
}

/** Records each summary sentence (or bullet) as evidence and returns the summary as one paragraph. */
export function parseSummary(lines: string[], ledger: Ledger): string {
  const joined = joinContinuations(lines);
  for (const line of joined) {
    const parts = isBulletLine(line) ? [stripBullet(line)] : sentences(stripBullet(line));
    parts.forEach((p) => ledger.add("summary", p));
  }
  return joined.map(stripBullet).join(" ");
}

/** A short non sentence line opens a project. Bullets and sentences under it are its evidence. */
export function parseProjects(lines: string[], ledger: Ledger): ProjectEntry[] {
  const projects: ProjectEntry[] = [];
  const closeTitleOnly = (): void => {
    const last = projects[projects.length - 1];
    // A project with no lines under it is evidenced by its own title line.
    if (last && last.evidenceIds.length === 0) {
      projects[projects.length - 1] = { ...last, evidenceIds: [ledger.add("project", last.title)] };
    }
  };
  for (const line of joinContinuations(lines)) {
    const text = stripBullet(line);
    if (!isBodyLine(line)) {
      closeTitleOnly();
      projects.push({ title: text, evidenceIds: [] });
      continue;
    }
    const id = ledger.add("project", text);
    const last = projects[projects.length - 1];
    if (last) projects[projects.length - 1] = { ...last, evidenceIds: [...last.evidenceIds, id] };
    else projects.push({ title: text, evidenceIds: [id] });
  }
  closeTitleOnly();
  return projects;
}

/** Records every line as evidence of the given section and returns the cleaned lines. */
export function recordLines(lines: string[], ledger: Ledger, section: EvidenceSection): string[] {
  const texts = joinContinuations(lines).map(stripBullet).filter(Boolean);
  texts.forEach((t) => ledger.add(section, t));
  return texts;
}
