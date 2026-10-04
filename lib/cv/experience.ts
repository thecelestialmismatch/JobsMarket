// Work history. A role starts at a line carrying a date range. The title and employer come from that
// line and, when it does not hold both, from the short heading lines just above it.
import type { ExperienceEntry } from "@/lib/types";
import { findDateRange, type DateRange } from "./dates";
import { countWords, isBodyLine, isBulletLine, joinContinuations, stripBullet } from "./normalise";
import { companyScore, isLocation, titleScore } from "./lexicon";
import type { Ledger } from "./ledger";

interface RoleDraft {
  title: string;
  employer: string;
  location?: string;
  range?: DateRange;
  evidenceIds: string[];
}

interface DateLine {
  range: DateRange;
  fragments: string[];
}

const FRAGMENT_SPLIT = /\s*\|\s*|\t+|\s+(?:at|@)\s+|\s+-\s+/i;

function cleanFragment(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/^[\s,;:|@-]+|[\s,;:|@-]+$/g, "")
    .trim();
}

function fragmentsOf(s: string): string[] {
  return s.split(FRAGMENT_SPLIT).map(cleanFragment).filter(Boolean);
}

/** A role heading line: holds a date range and is not a sentence that happens to mention years. */
function asDateLine(line: string): DateLine | null {
  if (isBulletLine(line)) return null;
  const range = findDateRange(line);
  if (!range) return null;
  const residual = line.replace(range.match, " ").trim();
  const words = countWords(residual);
  if (words > 12 || (words >= 5 && /[.!?]$/.test(residual))) return null;
  return { range, fragments: fragmentsOf(residual) };
}

function splitLocation(fragments: string[]): { rest: string[]; location?: string } {
  let location: string | undefined;
  const rest: string[] = [];
  for (const f of fragments) {
    const comma = f.lastIndexOf(",");
    if (isLocation(f)) location ??= f;
    else if (comma > 0 && isLocation(f.slice(comma + 1))) {
      location ??= f.slice(comma + 1).trim();
      rest.push(f.slice(0, comma).trim());
    } else rest.push(f);
  }
  return { rest, location };
}

function bestIndex(items: string[], score: (s: string) => number): number {
  return items.reduce((best, s, i) => (score(s) > score(items[best]) ? i : best), 0);
}

function assignRole(fragments: string[]): { title: string; employer: string } {
  if (fragments.length === 0) return { title: "", employer: "" };
  if (fragments.length === 1) {
    const only = fragments[0];
    return titleScore(only) >= 0 ? { title: only, employer: "" } : { title: "", employer: only };
  }
  const titleIdx = bestIndex(fragments, titleScore);
  const rest = fragments.filter((_, i) => i !== titleIdx);
  return { title: fragments[titleIdx], employer: rest[bestIndex(rest, companyScore)] };
}

/** Builds a role from the date line fragments plus as many trailing pending lines as needed to reach two fragments. */
function startRole(pending: string[], own: string[], range?: DateRange): { role: RoleDraft; leftover: string[] } {
  const mine = splitLocation(own);
  let location = mine.location;
  let taken: string[] = [];
  let i = pending.length - 1;
  for (let need = 2 - mine.rest.length; need > 0 && i >= 0; i--) {
    const parts = splitLocation(fragmentsOf(pending[i]));
    location ??= parts.location;
    taken = [...parts.rest, ...taken];
    need -= parts.rest.length;
  }
  const joined = [...taken, ...mine.rest];
  const fragments = joined.length === 1 ? joined[0].split(",").map(cleanFragment).filter(Boolean) : joined;
  return { role: { ...assignRole(fragments), location, range, evidenceIds: [] }, leftover: pending.slice(0, i + 1) };
}

function toEntry(r: RoleDraft): ExperienceEntry {
  return {
    title: r.title,
    employer: r.employer,
    ...(r.location ? { location: r.location } : {}),
    ...(r.range ? { start: r.range.start, end: r.range.end } : {}),
    evidenceIds: r.evidenceIds,
  };
}

export function parseExperience(lines: string[], ledger: Ledger): ExperienceEntry[] {
  const roles: RoleDraft[] = [];
  let pending: string[] = [];
  const record = (line: string): void => {
    const role = roles[roles.length - 1];
    const id = ledger.add("experience", stripBullet(line), role && { employer: role.employer, role: role.title });
    role?.evidenceIds.push(id);
  };
  const open = (own: string[], range?: DateRange): void => {
    const { role, leftover } = startRole(pending, own, range);
    leftover.forEach(record);
    roles.push(role);
    pending = [];
  };
  const flush = (): void => {
    // Heading lines with no dates before the first role still describe a role, so keep them as one.
    if (roles.length === 0 && pending.length >= 2) open([]);
    else pending.forEach(record);
    pending = [];
  };
  for (const line of joinContinuations(lines, (l) => asDateLine(l) !== null)) {
    const dated = asDateLine(line);
    if (dated) open(dated.fragments, dated.range);
    else if (isBodyLine(line)) {
      flush();
      record(line);
    } else pending.push(line);
  }
  flush();
  return roles.map(toEntry);
}
