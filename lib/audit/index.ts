import type { AuditFlag, ParsedCV, ResumeAudit } from "@/lib/types";
import { SOFT_SKILLS } from "@/lib/skills";
import { auditBullets, coachBullets, hasMetric, hasWeakOpener, LONG_BULLET_WORDS, usesFirstPerson, wordCount } from "./bullets";

// The ten second checks a recruiter runs on a CV, as deterministic rules.

const WORDS_PER_PAGE = 500;
const PENALTY = { high: 2.5, medium: 1.5, low: 0.5 } as const;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function monthIndex(ym: string | undefined, now: Date): number | null {
  if (!ym) return null;
  if (ym === "present") return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

function gapFlags(cv: ParsedCV, now: Date): AuditFlag[] {
  const spans = cv.experience
    .map((x) => ({ x, start: monthIndex(x.start, now), end: monthIndex(x.end, now) }))
    .filter((s): s is { x: (typeof cv.experience)[number]; start: number; end: number } => s.start !== null && s.end !== null)
    .sort((a, b) => a.start - b.start);
  const gaps: string[] = [];
  let reach = spans[0]?.end ?? 0;
  for (const s of spans.slice(1)) {
    if (s.start - reach > 6) gaps.push(`${s.start - reach - 1} months before ${s.x.title} at ${s.x.employer}`);
    reach = Math.max(reach, s.end);
  }
  if (!gaps.length) return [];
  return [
    {
      key: "gaps",
      label: "Unexplained gaps between roles",
      severity: "medium",
      detail: `There is a gap of ${gaps.join(", and ")}.`,
      fix: "Add one line for each gap, for example study, caring, travel, freelance or a personal project.",
    },
  ];
}

function dateFormatFlag(cv: ParsedCV): AuditFlag[] {
  const text = cv.rawSections.experience ?? "";
  const styles = [
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{4}\b/i,
    /\b\d{1,2}\/\d{4}\b/,
    /\b\d{4}-\d{2}\b/,
  ].filter((re) => re.test(text)).length;
  if (styles < 2) return [];
  return [
    {
      key: "date-formats",
      label: "Mixed date formats",
      severity: "low",
      detail: "Role dates use more than one format.",
      fix: "Use one format everywhere, such as Mar 2022 to Present.",
    },
  ];
}

function contactFlags(cv: ParsedCV): AuditFlag[] {
  const missing = [
    cv.contact.email ? null : "email",
    cv.contact.phone ? null : "phone number",
    cv.contact.links.some((l) => /linkedin\.com/i.test(l)) ? null : "LinkedIn link",
  ].filter((x): x is string => x !== null);
  if (!missing.length) return [];
  return [
    {
      key: "contact",
      label: "Missing contact details",
      severity: cv.contact.email ? "medium" : "high",
      detail: `The header has no ${missing.join(" or ")}.`,
      fix: "Put email, mobile, city and LinkedIn on one line under your name.",
    },
  ];
}

function bulletFlags(cv: ParsedCV): AuditFlag[] {
  const bullets = auditBullets(cv);
  if (!bullets.length) return [];
  const flags: AuditFlag[] = [];
  const withMetric = bullets.filter((b) => hasMetric(b.text)).length;
  if (withMetric / bullets.length < 0.4) {
    flags.push({
      key: "metrics",
      label: "Few measurable results",
      severity: "high",
      detail: `${withMetric} of ${bullets.length} bullets show a number, percentage or amount.`,
      fix: "Rebuild your strongest bullets as results with a figure you can defend in an interview.",
    });
  }
  const weak = bullets.filter((b) => hasWeakOpener(b.text)).length;
  if (weak) {
    flags.push({
      key: "weak-openers",
      label: "Duties instead of achievements",
      severity: "medium",
      detail: `${weak} bullets start with phrases such as Responsible for or Worked on.`,
      fix: "Start each bullet with what you changed, then how you did it.",
    });
  }
  const first = bullets.filter((b) => usesFirstPerson(b.text)).length;
  if (first) {
    flags.push({ key: "first-person", label: "First person in bullets", severity: "low", detail: `${first} bullets use I or my.`, fix: "Drop I and my from bullets and start with the action." });
  }
  const long = bullets.filter((b) => wordCount(b.text) > LONG_BULLET_WORDS).length;
  if (long) {
    flags.push({ key: "long-bullets", label: "Bullets that run long", severity: "low", detail: `${long} bullets are over ${LONG_BULLET_WORDS} words.`, fix: "Keep each bullet to one result in two lines or fewer." });
  }
  return flags;
}

function documentFlags(cv: ParsedCV, now: Date): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const pages = cv.wordCount / WORDS_PER_PAGE;
  if (pages > 2) {
    flags.push({ key: "length", label: "Longer than two pages", severity: "medium", detail: `About ${Math.ceil(pages)} pages at ${cv.wordCount} words.`, fix: "Cut to two pages by condensing older roles to one line each." });
  }
  if (!cv.summary && !cv.evidence.some((e) => e.section === "summary")) {
    flags.push({ key: "summary", label: "No summary", severity: "medium", detail: "Nothing at the top says what role you want or what you bring.", fix: "Add two or three lines naming your target role, your years and your strongest skills." });
  }
  const skillsText = (cv.rawSections.skills ?? "").toLowerCase();
  const soft = SOFT_SKILLS.filter((s) => skillsText.includes(s.toLowerCase()));
  if (soft.length >= 3) {
    flags.push({ key: "soft-skills", label: "Skills section leans on soft skills", severity: "low", detail: `It lists ${soft.slice(0, 4).join(", ")}.`, fix: "Replace soft skills with the tools and methods screening software looks for." });
  }
  const cutoff = now.getUTCFullYear() * 12 + now.getUTCMonth() - 15 * 12;
  const old = cv.experience.filter((x) => (monthIndex(x.end, now) ?? Infinity) < cutoff && x.evidenceIds.length >= 3);
  if (old.length) {
    flags.push({ key: "old-roles", label: "Old roles in full detail", severity: "low", detail: `${old.length} roles ended more than 15 years ago but keep several bullets.`, fix: "Reduce roles older than 15 years to a single line." });
  }
  return [...flags, ...gapFlags(cv, now), ...dateFormatFlag(cv), ...contactFlags(cv)];
}

export function auditResume(cv: ParsedCV, now: Date = new Date()): ResumeAudit {
  const flags = [...bulletFlags(cv), ...documentFlags(cv, now)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const penalty = flags.reduce((sum, f) => sum + PENALTY[f.severity], 0);
  const bullets = auditBullets(cv);
  return {
    score: Math.max(1, Math.min(10, Math.round(10 - penalty))),
    flags,
    toTen: flags.map((f) => f.fix),
    bulletCoach: coachBullets(bullets),
    stats: {
      bullets: bullets.length,
      bulletsWithMetrics: bullets.filter((b) => hasMetric(b.text)).length,
      wordCount: cv.wordCount,
      estPages: Math.max(1, Math.round((cv.wordCount / WORDS_PER_PAGE) * 10) / 10),
    },
  };
}
