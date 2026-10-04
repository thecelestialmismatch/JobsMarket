// Education entries. One entry is a qualification, an institution and dates, written on one line or
// spread over two or three short lines. Those lines become a single evidence line so that a sentence
// naming the degree, the institution and the year can cite one id.
import type { EducationEntry } from "@/lib/types";
import { findDateRange, findYear } from "./dates";
import { isBodyLine, stripBullet } from "./normalise";
import { isLocation } from "./lexicon";
import type { Ledger } from "./ledger";

// ponytail: keyword lists. A line with none of these words is read as qualification then institution in order.
const QUALIFICATION_RE =
  /\b(?:bachelor|master|masters|diploma|certificate|cert|degree|doctorate|doctor|phd|ph\.d|mba|bsc|msc|ba|ma|bcom|beng|meng|llb|jd|honours|hons|graduate|postgraduate|undergraduate|high school|secondary|year 12|vce|hsc|wace|ib|a levels?|gcse|associate)\b/i;
const INSTITUTION_RE = /\b(?:university|college|institute|tafe|school|academy|polytechnic|conservatorium)\b/i;
const YEARS = /(?<![\w/])(?:19|20)\d{2}(?![\w/])/g;
const SPLIT = /\s*\|\s*|\t+|,\s+|\s+-\s+/;

interface Draft {
  qualification: string;
  institution: string;
  start?: string;
  end?: string;
  lines: string[];
}

function clean(s: string): string {
  return s.replace(/\(\s*\)/g, "").replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, "").trim();
}

function readLine(line: string): Draft {
  const range = findDateRange(line);
  const year = range ? null : findYear(line);
  const residual = range ? line.replace(range.match, " ") : line.replace(YEARS, " ");
  const fragments = residual.split(SPLIT).map(clean).filter(Boolean);
  const qualification = fragments.find((f) => QUALIFICATION_RE.test(f) && !INSTITUTION_RE.test(f)) ?? "";
  const institution = fragments.find((f) => INSTITUTION_RE.test(f) && f !== qualification) ?? "";
  // Unrecognised fragments are used only when nothing on the line was recognised, so a city never becomes a degree.
  const others = qualification || institution ? [] : fragments.filter((f) => !isLocation(f));
  return {
    qualification: qualification || (others[0] ?? ""),
    institution: institution || (others[1] ?? ""),
    ...(range ? { start: range.start, end: range.end } : year ? { end: year } : {}),
    lines: [line],
  };
}

function fits(current: Draft, next: Draft): boolean {
  if (next.qualification && current.qualification) return false;
  if (next.institution && current.institution) return false;
  return !(next.end && current.end);
}

function combine(current: Draft, next: Draft): Draft {
  return {
    qualification: current.qualification || next.qualification,
    institution: current.institution || next.institution,
    start: current.start ?? next.start,
    end: current.end ?? next.end,
    lines: [...current.lines, ...next.lines],
  };
}

function toEntry(d: Draft, ledger: Ledger): EducationEntry {
  return {
    institution: d.institution,
    qualification: d.qualification,
    ...(d.start ? { start: d.start } : {}),
    ...(d.end ? { end: d.end } : {}),
    evidenceId: ledger.add("education", d.lines.map(stripBullet).join(", ")),
  };
}

/** Bullets and sentences under an entry (a thesis, a major, a grade) are recorded as their own education evidence. */
export function parseEducation(lines: string[], ledger: Ledger): EducationEntry[] {
  const entries: EducationEntry[] = [];
  let draft: Draft | null = null;
  const close = (): void => {
    if (draft) entries.push(toEntry(draft, ledger));
    draft = null;
  };
  for (const line of lines) {
    if (isBodyLine(line)) {
      close();
      ledger.add("education", stripBullet(line));
      continue;
    }
    const next = readLine(line);
    if (draft && fits(draft, next)) draft = combine(draft, next);
    else {
      close();
      draft = next;
    }
  }
  close();
  return entries;
}
