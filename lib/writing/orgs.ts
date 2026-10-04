// Organisation name detection for the fact check.

import { extractSkills } from "@/lib/skills";

const ORG_SUFFIX = new Set([
  "ltd", "limited", "pty", "inc", "llc", "llp", "plc", "gmbh", "corp", "corporation", "company", "co",
  "group", "holdings", "bank", "university", "college", "institute", "school", "academy", "agency", "council",
  "department", "ministry", "authority", "telecom", "analytics", "logistics", "solutions", "technologies",
  "technology", "systems", "services", "labs", "consulting", "consultants", "partners", "health", "hospital",
  "foundation", "association", "industries", "enterprises", "capital", "ventures", "studios", "media",
  "insurance", "energy", "freight", "airlines", "pharmaceuticals", "retail", "trust", "network", "networks",
]);

const LEADING_FUNCTION = new Set([
  "at", "in", "for", "with", "the", "i", "my", "as", "during", "while", "from", "on", "by", "to", "a", "an",
  "and", "our", "this", "that", "then", "when", "after", "before", "also", "most", "dear", "hi", "hello",
  "since", "under", "within", "across", "via", "into", "of", "open", "joined", "currently",
]);

const NOT_ORGS = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november",
  "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "present",
  "monday", "tuesday", "wednesday", "thursday", "friday", "hiring manager",
]);

const RUN_RE = /[A-Z][\w&'.-]*(?:\s+(?:of|and|&|[A-Z][\w&'.-]*))*/g;
const TRAILING_CONNECTOR = new Set(["of", "and", "&"]);

export function normalise(text: string): string {
  return text.toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** True when `name` appears in `text` as whole words, ignoring case, punctuation and "&" versus "and". */
export function mentions(text: string, name: string): boolean {
  const n = normalise(name);
  return n.length > 0 && new RegExp(`(^| )${escapeRe(n)}( |$)`).test(normalise(text));
}

function maskKnown(text: string, known: readonly string[]): string {
  const sorted = [...known].filter(Boolean).sort((a, b) => b.length - a.length);
  return sorted.reduce((acc, org) => {
    const flexible = escapeRe(org.trim())
      .replace(/\s*(?:&|\band\b)\s*/g, "\\s*(?:&|and)\\s*")
      .replace(/\s+/g, "\\s+");
    return acc.replace(new RegExp(`(?<!\\w)${flexible}(?!\\w)`, "gi"), " § ");
  }, text);
}

function candidateFrom(run: string, before: string): string | null {
  const words = run.split(/\s+/);
  let precededByAt = /\bat\s*$/i.test(before);
  while (words.length && LEADING_FUNCTION.has(words[0].toLowerCase())) {
    if (words[0].toLowerCase() === "at") precededByAt = true;
    words.shift();
  }
  while (words.length && TRAILING_CONNECTOR.has(words[words.length - 1].toLowerCase())) words.pop();
  if (!words.length) return null;
  const hasSuffix = words.some((w) => ORG_SUFFIX.has(w.toLowerCase().replace(/[.,']+$/, "")));
  return hasSuffix || precededByAt ? words.join(" ").replace(/[.,]+$/, "") : null;
}

/**
 * Capitalised names that look like organisations and are not in `known`.
 * `ignore` holds job and role titles, masked like known names so "Logistics Coordinator" is not read as a company.
 */
// ponytail: suffix words plus "at X" catch most employer mentions. A named entity model is the upgrade.
export function unknownOrgs(text: string, known: readonly string[], ignore: readonly string[]): string[] {
  const masked = maskKnown(text, [...known, ...ignore]);
  const found = masked
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) =>
      [...sentence.matchAll(RUN_RE)].map((m) => candidateFrom(m[0].replace(/[.!?]+$/, ""), sentence.slice(0, m.index ?? 0))),
    )
    .filter((c): c is string => c !== null)
    .filter((c) => !NOT_ORGS.has(c.toLowerCase()))
    .filter((c) => extractSkills(c).length === 0);
  return [...new Set(found)];
}
