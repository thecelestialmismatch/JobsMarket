// LinkedIn profile audit from the "Save to PDF" export. Deterministic rules ported from the MIT licensed
// linkedin-skills profile optimizer (vendor/linkedin-skills, Sergey Bulaev). Only what the PDF shows is scored.
import type { AuditFlag, ParsedCV } from "@/lib/types";
import { auditResume } from "@/lib/audit";
import { isLocation } from "@/lib/cv/lexicon";
import { normaliseText } from "@/lib/cv/normalise";
import { parseCv } from "@/lib/cv/parse";
import { detectHeading } from "@/lib/cv/sections";
import { hasErrors, lintText } from "@/lib/writing/lint";
import { numbersIn } from "@/lib/writing/text";

export interface LinkedInProfile {
  name?: string;
  headline?: string;
  about?: string;
  url?: string;
  cv: ParsedCV;
}

export type SectionKey = "headline" | "about" | "experience" | "url" | "skills" | "photo" | "banner" | "featured" | "recommendations";
export interface SectionResult {
  key: SectionKey;
  label: string;
  status: "pass" | "needs-work" | "not-provided";
}
export interface Rewrite {
  section: "headline" | "url";
  text: string;
}
export interface ProfileAudit {
  score: number; // 1 to 10, over the scored sections only
  scored: number;
  sections: SectionResult[];
  flags: AuditFlag[];
  rewrites: Rewrite[];
}

const HEADLINE_MIN = 80;
const HEADLINE_MAX = 220;
const ABOUT_MIN_WORDS = 200;
const ABOUT_MAX_WORDS = 300;
const HOOK_CHARS = 270;
const PENALTY = { high: 2.5, medium: 1.5, low: 0.5 } as const;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const FILLER = /\b(?:passionate|driven|results[- ]oriented|hard[- ]?working|motivated|team player|thought leader|synergy|innovative|disruptor)\b/i;
const NAME_LINE = /^\p{Lu}[\p{L}'.-]*(?: \p{Lu}[\p{L}'.-]*){1,3}$/u;
const SIDEBAR = /^(?:contact|top skills|languages|certifications|honors and awards|publications|patents|courses|projects)$/i;
const URL_RE = /(?:www\.)?linkedin\.com\/in\/[\w%-]+/i;
const NOT_PROVIDED: [SectionKey, string][] = [
  ["skills", "Skills"], ["photo", "Photo"], ["banner", "Banner"], ["featured", "Featured"], ["recommendations", "Recommendations"],
];

// LinkedIn prints "City, State, Country" and a section heading follows it.
const isExportLocation = (l: string, next: string | undefined) =>
  isLocation(l) || (/^[\p{L}' .-]+(?:, [\p{L}' .-]+){1,2}$/u.test(l) && next !== undefined && detectHeading(next) !== null);

// The export prints name, headline (wrapped over up to four lines), then location. ponytail: takes the name shaped
// line nearest the location in the six above it, skipping lines that continue a wrapped headline. A wrapped
// fragment such as "Data Analyst" after a line with no trailing | or , could still be misread. Upgrade to column
// aware parsing if exports vary.
function readHeadline(lines: string[]): Pick<LinkedInProfile, "name" | "headline"> {
  const at = lines.slice(0, 60).findIndex((l, i) => i > 1 && isExportLocation(l, lines[i + 1]));
  if (at < 0) return {};
  const window = lines.slice(Math.max(0, at - 6), at);
  let nameAt = -1;
  window.forEach((l, i) => {
    const continues = i > 0 && /[|,&-]$/.test(window[i - 1]);
    if (i < window.length - 1 && NAME_LINE.test(l) && !/[|@\d]/.test(l) && !SIDEBAR.test(l) && !continues) nameAt = i;
  });
  if (nameAt < 0) return {};
  return { name: window[nameAt], headline: window.slice(nameAt + 1).join(" ") };
}

export function readProfile(text: string, now: Date = new Date()): LinkedInProfile {
  const cv = parseCv(text, { now });
  const lines = normaliseText(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const url = URL_RE.exec(text)?.[0];
  const about = cv.rawSections.summary?.trim();
  return { ...readHeadline(lines), ...(about ? { about } : {}), ...(url ? { url } : {}), cv };
}

const flag = (key: string, label: string, severity: AuditFlag["severity"], detail: string, fix: string): AuditFlag => ({ key, label, severity, detail, fix });
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function headlineFlags(h: string | undefined): AuditFlag[] {
  if (!h) return [flag("headline-missing", "No headline found", "high", "The export has no headline under your name.", "Write a headline that says what you do and who you help.")];
  const out: AuditFlag[] = [];
  if (FILLER.test(h)) out.push(flag("headline-filler", "Filler words in the headline", "medium", `"${h}" uses words that carry no signal.`, "Name your function, your audience and a result instead of adjectives."));
  if (h.length < HEADLINE_MIN) out.push(flag("headline-short", "Headline leaves space unused", "medium", `It uses ${h.length} of ${HEADLINE_MAX} characters.`, "Use the space for your target role, your top tools and the sector you serve, split with a pipe."));
  if (h === h.toUpperCase() && /[A-Z]{4}/.test(h)) out.push(flag("headline-caps", "Headline is all capitals", "medium", "All caps reads as shouting.", "Use normal capitalisation."));
  if (/\p{Extended_Pictographic}/u.test(h)) out.push(flag("headline-emoji", "Emoji in the headline", "low", "Emoji chains read as low effort.", "Remove them."));
  if (/\bopen to work\b/i.test(h)) out.push(flag("headline-open-to-work", "Open to work in the headline", "low", "It spends headline space on a status.", "Use LinkedIn's Open to Work setting and keep the headline for keywords."));
  if (/\b\d+\+? years\b/i.test(h)) out.push(flag("headline-years", "Years of experience in the headline", "low", "Nobody searches for a number of years.", "Name the role and skills recruiters search for."));
  return out;
}

function aboutFlags(a: string | undefined): AuditFlag[] {
  if (!a) return [flag("about-missing", "No About section found", "high", "The export has no About text.", "Write 200 to 300 words in the first person, with the pitch in the first 270 characters.")];
  const n = words(a);
  const out: AuditFlag[] = [];
  if (n < ABOUT_MIN_WORDS) out.push(flag("about-short", "About section is short", "medium", `It has ${n} words and the target is ${ABOUT_MIN_WORDS} to ${ABOUT_MAX_WORDS}.`, "Add your role, one or two results with figures, your tools and a clear next step."));
  if (n > ABOUT_MAX_WORDS) out.push(flag("about-long", "About section is long", "low", `It has ${n} words.`, `Cut to ${ABOUT_MAX_WORDS} words or fewer.`));
  if (!/\b(?:I|I'm|I've|my|me)\b/.test(a)) out.push(flag("about-third-person", "About is written in the third person", "medium", "No first person words were found.", "Rewrite it as I do this for these people."));
  if (FILLER.test(a)) out.push(flag("about-filler", "Filler words in About", "medium", "It uses words such as passionate or driven.", "Replace each with a specific fact."));
  if (/^(?:welcome|hello|hi)\b/i.test(a)) out.push(flag("about-greeting", "About opens with a greeting", "low", "The opening line is the only one most people read.", "Open with your strongest claim."));
  if (/let'?s connect\W*$/i.test(a)) out.push(flag("about-dead-cta", "About ends with a dead call to action", "low", "Let's connect gives the reader nothing to do.", "Name one specific next step."));
  const firstSentence = /^[\s\S]*?[.!?](?:\s|$)/.exec(a)?.[0] ?? a;
  if (firstSentence.length > HOOK_CHARS) out.push(flag("about-hook", "Opening sentence overruns the preview", "low", `The first sentence is ${firstSentence.length} characters and the preview shows about ${HOOK_CHARS}.`, "Make the first sentence short enough to finish before see more."));
  return out;
}

const hash = (slug: string) => /-[a-z0-9]{6,}$/i.test(slug) && /\d/.test(slug.split("-").pop() ?? "");

function urlParts(p: LinkedInProfile): { flags: AuditFlag[]; rewrites: Rewrite[] } {
  const slug = p.url?.split("/in/")[1];
  if (!slug || !hash(slug)) return { flags: [], rewrites: [] };
  const clean = (p.name ?? "").normalize("NFKD").replace(/[^A-Za-z]/g, "").toLowerCase();
  return {
    flags: [flag("url-default", "Default profile URL", "low", `Your address ends in a random code (${slug.split("-").pop()}).`, "Claim a custom URL made of your name.")],
    rewrites: clean ? [{ section: "url", text: `linkedin.com/in/${clean}` }] : [],
  };
}

function headlineRewrite(p: LinkedInProfile): Rewrite[] {
  const role = p.cv.experience[0]?.title;
  if (!role) return [];
  const text = [role, p.cv.skills.slice(0, 3).join(", ")].filter(Boolean).join(" | ");
  return [{ section: "headline", text }];
}

export function auditProfile(p: LinkedInProfile, now: Date = new Date()): ProfileAudit {
  const experience = auditResume(p.cv, now).flags.filter((f) => ["metrics", "weak-openers", "long-bullets"].includes(f.key));
  const hasRoles = p.cv.experience.length > 0;
  const head = headlineFlags(p.headline);
  const about = aboutFlags(p.about);
  const url = urlParts(p);
  const flags = [...head, ...about, ...(hasRoles ? experience : []), ...url.flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const status = (f: AuditFlag[], seen = true): SectionResult["status"] => (!seen ? "not-provided" : f.length ? "needs-work" : "pass");
  const sections: SectionResult[] = [
    { key: "headline", label: "Headline", status: status(head) },
    { key: "about", label: "About", status: status(about) },
    { key: "experience", label: "Experience", status: status(experience, hasRoles) },
    { key: "url", label: "Custom URL", status: status(url.flags, Boolean(p.url)) },
    ...NOT_PROVIDED.map(([key, label]) => ({ key, label, status: "not-provided" as const })),
  ];
  const allowed = new Set(numbersIn([p.headline, p.about, p.cv.rawSections.experience].join(" ")));
  const rewrites = [...(head.length ? headlineRewrite(p) : []), ...url.rewrites].filter((r) => !hasErrors(lintText(r.text, { allowedNumbers: allowed })));
  return {
    score: Math.max(1, Math.min(10, Math.round(10 - flags.reduce((s, f) => s + PENALTY[f.severity], 0)))),
    scored: sections.filter((s) => s.status !== "not-provided").length,
    sections,
    flags,
    rewrites,
  };
}
