import { extractSkills } from "@/lib/skills";
import { listNames } from "@/lib/match/rubric";
import type { BulletCoach, Evidence, ParsedCV } from "@/lib/types";

export const LONG_BULLET_WORDS = 40;
const MAX_COACHED = 12;
const NO_FIGURE = "[add figure]";

const WEAK_OPENER = /^(?:responsible for|duties included|helped with|worked on|assisted with|tasks included)\b[\s,:;.\-–—]*/i;
const BULLET_MARK = /^[\s•·▪◦‣*\-–—]+/;
const YEAR = /\b(?:19|20)\d{2}\b/g;
const METRIC_TOKEN = /[$€£¥]?\d[\d,.]*\s?(?:%|percent\b|per cent\b|k\b|m\b|bn\b|million\b|billion\b)?/gi;
const FIRST_PERSON = /\bI\b|\b(?:me|my|mine|myself)\b/i;

/** Experience lines from the uploaded CV. Lines imported from GitHub are not part of the document being audited. */
export function auditBullets(cv: ParsedCV): Evidence[] {
  return cv.evidence.filter((e) => e.section === "experience" && e.source !== "github");
}

export function hasMetric(text: string): boolean {
  return /\d|%|\bper ?cent\b/i.test(text.replace(YEAR, " "));
}

export function hasWeakOpener(text: string): boolean {
  return WEAK_OPENER.test(text.replace(BULLET_MARK, ""));
}

export function usesFirstPerson(text: string): boolean {
  // "I" is matched case sensitively so the roman numeral style "Analyst i" never counts.
  return /\bI\b/.test(text) || /\b(?:me|my|mine|myself)\b/i.test(text);
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function metricTokens(text: string): string[] {
  const tokens = (text.replace(YEAR, " ").match(METRIC_TOKEN) ?? []).map((t) => t.trim().replace(/[.,]+$/, ""));
  return [...new Set(tokens.filter((t) => /\d/.test(t)))];
}

/** Bullet text made safe for generated copy, with no dashes, semicolons, connector colons or emphasis. */
function sanitise(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*(?:[–—;]|(?<!\d):(?!\/\/|\d))\s*/g, ", ")
    .replace(/!/g, ".")
    .replace(/(?:,\s*)+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s.,]+$/g, "");
}

const IRREGULAR: Record<string, string> = {
  built: "building", rebuilt: "rebuilding", led: "leading", ran: "running", run: "running", wrote: "writing",
  made: "making", drove: "driving", grew: "growing", cut: "cutting", set: "setting", won: "winning",
  took: "taking", gave: "giving", kept: "keeping", sold: "selling", taught: "teaching", brought: "bringing",
  found: "finding", held: "holding", met: "meeting", sent: "sending", oversaw: "overseeing", began: "beginning",
  spent: "spending", paid: "paying", chose: "choosing", plan: "planning", get: "getting", got: "getting",
};
const PRESENT_VERBS = new Set([
  "manage", "build", "lead", "create", "develop", "design", "maintain", "support", "coordinate", "prepare",
  "deliver", "analyse", "analyze", "write", "handle", "oversee", "process", "monitor", "review", "train",
  "conduct", "implement", "improve", "reduce", "increase", "use", "work", "help", "assist", "provide", "ensure",
  "respond", "resolve", "report", "own", "drive", "mentor", "test", "deploy", "automate", "migrate", "negotiate",
  "present", "research", "schedule", "track", "update", "organise", "organize", "launch",
]);

// ponytail: rule based -ing form for the first word only (irregular table, -ied, -ed, a short list of
// present tense verbs). Anything else falls back to "doing ...". Upgrade to a part of speech tagger if
// coached templates read awkwardly in practice.
function gerund(word: string): string | null {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (!/^[a-z]+$/.test(w)) return null;
  if (w.endsWith("ing") && w.length > 4) return w;
  if (w.endsWith("ied") && w.length > 4) return `${w.slice(0, -3)}ying`;
  if (w.endsWith("ed") && w.length >= 4) return `${w.slice(0, -2)}ing`;
  if (PRESENT_VERBS.has(w)) return w.endsWith("e") && !w.endsWith("ee") ? `${w.slice(0, -1)}ing` : `${w}ing`;
  return null;
}

/** Lower cases a sentence initial word unless it looks like a name, an acronym or a skill. */
function sentenceCase(word: string): string {
  if (!/^[A-Z][a-z']+$/.test(word) || extractSkills(word).length) return word;
  return word.toLowerCase();
}

/** The Z of the XYZ formula, taken from the bullet with any weak opener removed. */
function actionClause(bullet: string): string {
  const stripped = bullet.replace(BULLET_MARK, "");
  const hadOpener = WEAK_OPENER.test(stripped);
  const body = sanitise(stripped.replace(WEAK_OPENER, ""));
  if (!body) return "doing [describe what you did]";
  const [first, ...rest] = body.split(" ");
  const g = gerund(first);
  if (g) return [g, ...rest].join(" ");
  return ["doing", hadOpener ? first : sentenceCase(first), ...rest].join(" ");
}

/** Google's XYZ formula. Only figures already in the bullet are reused, anything else stays a placeholder. */
export function xyzTemplate(bullet: string): string {
  const figures = metricTokens(bullet);
  const measure = figures.length ? listNames(figures) : NO_FIGURE;
  return `Accomplished [state the result] as measured by ${measure}, by ${actionClause(bullet)}.`;
}

function issuesFor(text: string): string[] {
  return [
    hasMetric(text) ? null : "No measurable result",
    hasWeakOpener(text) ? "Starts with a weak opener" : null,
    usesFirstPerson(text) ? "Uses first person" : null,
    wordCount(text) > LONG_BULLET_WORDS ? `Longer than ${LONG_BULLET_WORDS} words` : null,
  ].filter((i): i is string => i !== null);
}

/** Up to twelve bullets with no figure or a weak opener, in document order, each with an XYZ rewrite template. */
export function coachBullets(bullets: Evidence[]): BulletCoach[] {
  return bullets
    .filter((b) => !hasMetric(b.text) || hasWeakOpener(b.text))
    .slice(0, MAX_COACHED)
    .map((b) => ({ evidenceId: b.id, original: b.text, issues: issuesFor(b.text), xyzTemplate: xyzTemplate(b.text) }));
}
