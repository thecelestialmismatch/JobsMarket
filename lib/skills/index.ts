// Skills taxonomy and extractor. Data lives in data.ts, families.ts and learn.ts.

import { SKILL_DEFS } from "./data";
import { FAMILY_DEFS } from "./families";
import { LEARN } from "./learn";

export type SkillCategory =
  | "language"
  | "data"
  | "cloud"
  | "devops"
  | "web"
  | "security"
  | "crm"
  | "analytics"
  | "design"
  | "product"
  | "office"
  | "domain"
  | "method";

export interface SkillDef {
  name: string; // canonical display name
  aliases: string[]; // lower case alternates matched on word boundaries
  category: SkillCategory;
  implies?: string[]; // parent skills credited whenever this one is found
  caseSensitive?: boolean; // the canonical name only matches with its own capitalisation
  aliasOnly?: boolean; // the canonical name is too ambiguous to match by itself
}

export interface RoleFamily {
  id: string; // kebab case, e.g. "data-analyst"
  label: string; // "Data Analyst"
  titles: string[]; // common job titles in this family, most common first
  coreSkills: string[]; // canonical skill names an ATS scans for
  keywords: string[]; // non skill ATS phrases, e.g. "stakeholder reporting"
  portfolioBenefit: boolean; // true when a portfolio page helps (software, data, design, marketing)
}

export const SKILLS: SkillDef[] = SKILL_DEFS;
export const ROLE_FAMILIES: RoleFamily[] = FAMILY_DEFS;

export const SOFT_SKILLS: string[] = [
  "team player", "hard working", "hardworking", "communication skills", "excellent communication", "self motivated",
  "self-motivated", "detail oriented", "detail-oriented", "attention to detail", "problem solving", "problem solver",
  "time management", "work ethic", "fast learner", "quick learner", "adaptable", "flexible", "reliable", "punctual",
  "positive attitude", "people skills", "interpersonal skills", "multitasking", "multi-tasking", "proactive",
  "go-getter", "passionate", "dedicated", "motivated", "organised", "organized",
];

const WORD = "A-Za-z0-9+#";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const bounded = (alts: string[], flags: string) =>
  alts.length ? new RegExp(`(?:^|[^${WORD}])(?:${alts.map(escapeRe).join("|")})(?=$|[^${WORD}])`, flags) : null;

interface Matcher {
  name: string;
  name_re: RegExp | null;
  alias_re: RegExp | null;
  implies: string[];
}

const MATCHERS: Matcher[] = SKILLS.map((s) => ({
  name: s.name,
  name_re: s.aliasOnly ? null : s.caseSensitive ? bounded([s.name], "") : bounded([s.name.toLowerCase()], "i"),
  alias_re: bounded(s.aliases, "i"),
  implies: s.implies ?? [],
}));
const ORDER = new Map(SKILLS.map((s, i) => [s.name, i]));

/** Canonical skill names mentioned in the text plus their implied parents, in taxonomy order, deduplicated. */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const m of MATCHERS) {
    if (m.name_re?.test(text) || m.alias_re?.test(text)) {
      found.add(m.name);
      m.implies.forEach((p) => found.add(p));
    }
  }
  return [...found].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));
}

const SENIORITY = /\b(?:senior|snr|sr|junior|jnr|jr|lead|principal|staff|graduate|grad|intern|internship|trainee|entry level|associate|assistant|head of|chief|level \d|l\d|i{1,3})\b\.?/gi;

function normaliseTitle(title: string): string {
  return title
    .split(/\s[-–—|]\s|\s(?:at|@)\s|[(\[]/i)[0]
    .replace(SENIORITY, " ")
    .replace(/[^a-z0-9+#&./ ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Best matching role family id for a job or CV title, or null. Longest matching family title wins. */
export function classifyTitle(title: string): string | null {
  const t = normaliseTitle(title);
  if (!t) return null;
  const tokens = new Set(t.split(" "));
  let best: { id: string; score: number } | null = null;
  for (const f of ROLE_FAMILIES) {
    for (const ft of f.titles) {
      const n = normaliseTitle(ft);
      let score = 0;
      if (t === n) score = 1000 + n.length;
      else if (` ${t} `.includes(` ${n} `)) score = 500 + n.length;
      else {
        const words = n.split(" ");
        if (words.length > 1 && words.every((w) => tokens.has(w))) score = 200 + n.length;
      }
      if (score && (!best || score > best.score)) best = { id: f.id, score };
    }
  }
  return best?.id ?? null;
}

export function roleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((f) => f.id === id);
}

/** One honest, specific next step for learning a skill. */
export function learnHint(skill: string): string {
  return LEARN[skill] ?? `Build one small project that uses ${skill} and add a CV bullet describing what it did.`;
}
