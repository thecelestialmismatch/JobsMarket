import { classifyTitle, extractSkills } from "@/lib/skills";
import type { DegreeLevel, EligibilityBar, JobRequirements, Seniority } from "@/lib/types";

interface Segment {
  text: string; // a clause, the unit for the nice or required decision
  sentence: string; // the whole sentence or bullet, quoted back for eligibility bars
  nice: boolean;
}

const BULLET = /^\s*(?:[-*•·▪◦‣–—]|\d{1,2}[.)])\s+/;
const NICE_CUE =
  /nice[- ]to[- ]have|desirable|\bbonus\b|\bpreferred\b(?!\s+(?:candidate|applicant))|preferable|advantageous|an advantage|\ba plus\b|would be (?:great|beneficial|nice|helpful)|highly regarded|not essential|\bideally\b/i;
const HEADING =
  /^(?:about (?:you|the role|the team|us)|who you are|what you(?:'ll| will) (?:bring|need|do)|(?:key |core )?(?:responsibilities|duties)|(?:the )?role|requirements|(?:key |essential |minimum |technical )?(?:skills|experience|qualifications|criteria)(?: (?:and|&) (?:skills|experience|qualifications))*(?: required)?|what we offer|benefits|essential|selection criteria)$/i;

function normalise(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/\r/g, "");
}

function isHeading(line: string): boolean {
  if (BULLET.test(line)) return false;
  const t = line.trim();
  if (t.endsWith(":")) return true;
  if (HEADING.test(t)) return true;
  const short = t.split(/\s+/).length <= 6 && !/[.!?,;]$/.test(t);
  return short && NICE_CUE.test(t) && extractSkills(t).length === 0;
}

function splitSentences(line: string): string[] {
  return line
    .replace(BULLET, "")
    .replace(/([.!?])\s+(?=[A-Z0-9(])/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ponytail: clauses split only on strong connectors, so "SQL is essential, Tableau is desirable"
// marks both as nice. Upgrade to a per-clause cue scope if adverts show this often.
function splitClauses(sentence: string): string[] {
  return sentence.split(/(?=;|\bbut\b|\bwhile\b|\bwhereas\b|\bideally\b)/i).filter((c) => c.trim());
}

/** Sentences and bullet lines tagged nice when under a nice heading or carrying a nice cue. */
function segment(description: string): Segment[] {
  let niceSection = false;
  const out: Segment[] = [];
  for (const raw of normalise(description).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      niceSection = NICE_CUE.test(line);
      out.push({ text: line, sentence: line, nice: niceSection });
      continue;
    }
    for (const sentence of splitSentences(line)) {
      for (const clause of splitClauses(sentence)) {
        out.push({ text: clause.trim(), sentence, nice: niceSection || NICE_CUE.test(clause) });
      }
    }
  }
  return out;
}

function splitSkills(title: string, segments: Segment[]): { required: string[]; nice: string[] } {
  const required = new Set(extractSkills(title));
  const nice = new Set<string>();
  for (const s of segments) {
    for (const skill of extractSkills(s.text)) (s.nice ? nice : required).add(skill);
  }
  return { required: [...required], nice: [...nice].filter((s) => !required.has(s)) };
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?:\\s*\\(\\d{1,2}\\))?";
const YEARS_RE = new RegExp(
  `(^|[^\\w.,$])${NUM}\\s*(?:\\+|plus)?\\s*(?:(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*)?(?:years?|yrs?)\\b(?=([^.]{0,40}))`,
  "gi",
);
const EXPERIENCE_TAIL = /^\s*'?\s*(?:of|in|working|as|with|commercial|professional|industry|relevant|hands[- ]on|practical)\b/i;
const NOT_EXPERIENCE_TAIL = /^\s*(?:old|of age|ago)\b/i;
const TIME_FRAME_BEFORE = /\b(?:within|after|next|past|last|first|every)\s*$/i;
const MAX_PLAUSIBLE_YEARS = 30;

function toNumber(token: string): number {
  return WORD_NUMBERS[token.toLowerCase()] ?? Number(token);
}

function yearsInSentence(sentence: string): number[] {
  const found: number[] = [];
  const mentionsExperience = /\bexperien/i.test(sentence);
  for (const m of sentence.matchAll(YEARS_RE)) {
    const tail = m[4] ?? "";
    const before = sentence.slice(0, (m.index ?? 0) + m[1].length);
    if (NOT_EXPERIENCE_TAIL.test(tail) || TIME_FRAME_BEFORE.test(before)) continue;
    if (!mentionsExperience && !EXPERIENCE_TAIL.test(tail)) continue;
    const n = toNumber(m[2]);
    if (n <= MAX_PLAUSIBLE_YEARS) found.push(n);
  }
  return found;
}

/** Largest stated floor across required sentences, since every stated floor must be met. */
function minYears(segments: Segment[]): number | null {
  const floors = segments.filter((s) => !s.nice).flatMap((s) => yearsInSentence(s.text));
  return floors.length ? Math.max(...floors) : null;
}

const DEGREE_NEGATION = /\b(?:no|without an?)\s+(?:formal\s+)?degree\b|\bdegree\b[^.]{0,30}\bnot\s+(?:required|essential|necessary|needed)\b/i;
const PHD = /\bph\.?\s?d\b|\bdoctorate\b|\bdoctoral\b/i;
const MASTER = /\bmaster(?:'s|s)?\s+(?:degree|of|in)\b|\bmaster's\b|\bm\.?sc\b|\bmba\b|\bpostgraduate (?:degree|qualification)/i;
const BACHELOR = /\bbachelor|\bundergraduate degree|\bb\.?sc\b|\btertiary (?:degree|qualification)/i;
const BARE_DEGREE = /(\d+[\s-]*|\b(?:high|some|great|large|certain|significant|varying)\s+)?\bdegrees?\b(\s+of\b)?/gi;

function mentionsBareDegree(sentence: string): boolean {
  return [...sentence.matchAll(BARE_DEGREE)].some((m) => !m[1] && !m[2]);
}

function degreeIn(sentence: string): DegreeLevel | null {
  if (DEGREE_NEGATION.test(sentence)) return null;
  if (BACHELOR.test(sentence)) return "bachelor";
  if (MASTER.test(sentence)) return "master";
  if (PHD.test(sentence)) return "phd";
  return mentionsBareDegree(sentence) ? "bachelor" : null;
}

const DEGREE_RANK: Record<DegreeLevel, number> = { none: 0, bachelor: 1, master: 2, phd: 3 };

/** Lowest level asked for in a required sentence, because that is the entry bar. */
function degree(segments: Segment[]): DegreeLevel | null {
  const levels = segments
    .filter((s) => !s.nice)
    .map((s) => degreeIn(s.text))
    .filter((d): d is DegreeLevel => d !== null);
  if (!levels.length) return null;
  return levels.reduce((a, b) => (DEGREE_RANK[b] < DEGREE_RANK[a] ? b : a));
}

const TITLE_SENIORITY: [Seniority, RegExp][] = [
  ["principal", /\bprincipal\b/i],
  ["lead", /\blead\b|\bleader\b/i],
  ["senior", /\bsenior\b|\bsnr\b|\bsr\b/i],
  ["intern", /\bintern(?:ship)?\b/i],
  ["junior", /\bjunior\b|\bjnr\b|\bjr\b|\bgraduate\b|\bgrad\b|\bentry[- ]level\b|\btrainee\b/i],
];

function seniority(title: string, years: number | null): Seniority | null {
  const fromTitle = TITLE_SENIORITY.find(([, re]) => re.test(title));
  if (fromTitle) return fromTitle[0];
  if (years === null) return null;
  if (years <= 1) return "junior";
  if (years <= 4) return "mid";
  if (years <= 7) return "senior";
  return "lead";
}

const ELIGIBILITY: [EligibilityBar["kind"], RegExp][] = [
  ["citizenship", /\bcitizen(?:ship|s)?\b/i],
  ["permanent_residency", /\bpermanent resid(?:ent|ency|ence)/i],
  [
    "work_rights",
    /full (?:working|work) rights|rights? to work in|working rights|work rights|no (?:visa )?sponsorship|sponsorship is not (?:available|offered|provided)|(?:unable|not able) to (?:offer|provide) (?:visa )?sponsorship|valid (?:work )?visa|eligible to work in|legally entitled to work/i,
  ],
  [
    "security_clearance",
    /security clearance|\bnv ?[12]\b|\bagsva\b|\b(?:negative|positive) vetting\b|\bbaseline (?:security )?(?:clearance|vetting)\b|\b(?:obtain|hold|maintain)\s+(?:an?\s+)?baseline\b/i,
  ],
  [
    "license",
    /drivers?'?s? licen[cs]e|driving licen[cs]e|\bwwcc\b|working with children|police (?:check|clearance)|criminal (?:record|history) check/i,
  ],
];

function eligibility(segments: Segment[]): EligibilityBar[] {
  const seen = new Set<EligibilityBar["kind"]>();
  const bars: EligibilityBar[] = [];
  for (const { sentence } of segments) {
    for (const [kind, re] of ELIGIBILITY) {
      if (seen.has(kind) || !re.test(sentence)) continue;
      if (kind === "citizenship" && /corporate citizen/i.test(sentence)) continue;
      seen.add(kind);
      bars.push({ kind, text: sentence });
    }
  }
  return bars;
}

/** Structured requirements derived once from an advert's title and plain text description. */
export function analyzeJob(input: { title: string; description: string }): JobRequirements {
  if (typeof input?.title !== "string" || typeof input?.description !== "string") {
    throw new TypeError("analyzeJob needs a string title and a string description");
  }
  const title = normalise(input.title);
  const segments = segment(input.description);
  const { required, nice } = splitSkills(title, segments);
  const years = minYears(segments);
  return {
    requiredSkills: required,
    niceSkills: nice,
    minYears: years,
    degree: degree(segments),
    seniority: seniority(title, years),
    eligibility: eligibility(segments),
    roleFamily: classifyTitle(title),
  };
}
