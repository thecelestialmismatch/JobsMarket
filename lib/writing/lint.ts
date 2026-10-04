import type { DocKind, DraftDocument, LintIssue } from "@/lib/types";
import { AI_PHRASES, META_PHRASES } from "./banned-phrases";
import { numbersIn, stripForColon } from "./text";

export interface LintOptions {
  allowedNumbers?: ReadonlySet<string>;
  allowPlaceholders?: boolean;
  doc?: DocKind;
}

interface Rule {
  rule: string;
  severity: LintIssue["severity"];
  re: RegExp;
  message: (match: string) => string;
  prepare?: (text: string) => string;
}

const phraseRe = (sources: readonly string[]) => new RegExp(`\\b(?:${sources.join("|")})\\b`, "gi");

// ponytail: "generated" is flagged unless a CV style object follows it ("Generated $2M", "generated 40 leads").
// Upgrade path is a part of speech check if the allow list keeps growing.
const GENERATED_RE =
  /\bgenerated\b(?!\s+(?:[$£€]?\d|over\b|more\b|new\b|revenue|sales|leads|savings|income|profit|interest|demand|pipeline|traffic|enquiries|referrals))/gi;

const RULES: readonly Rule[] = [
  {
    rule: "dash",
    severity: "error",
    re: new RegExp("[\\u2012-\\u2015]|--|(?<=\\w)\\s+-\\s+(?=\\w)", "g"),
    message: () => "Replace the dash with a comma, the word to, or a new sentence.",
  },
  {
    rule: "semicolon",
    severity: "error",
    re: /;/g,
    message: () => "Replace the semicolon with a comma and the word and, or split the sentence.",
  },
  {
    rule: "colon",
    severity: "error",
    re: /:/g,
    prepare: stripForColon,
    message: () => "Rewrite the sentence without a colon.",
  },
  { rule: "double-space", severity: "error", re: / {2,}/g, message: () => "Use a single space between words." },
  { rule: "bold", severity: "error", re: /\*\*.*?\*\*|__.*?__|\*\*|__/g, message: () => "Remove the markdown bold markers." },
  { rule: "exclamation", severity: "warning", re: /!/g, message: () => "Replace the exclamation mark with a full stop." },
  {
    rule: "emoji",
    severity: "error",
    re: new RegExp("(?![\\u00a9\\u00ae\\u2122])\\p{Extended_Pictographic}|\\p{Regional_Indicator}", "gu"),
    message: () => "Remove the emoji.",
  },
  {
    rule: "ai-phrase",
    severity: "error",
    re: phraseRe(AI_PHRASES),
    message: (m) => `Replace the generic phrase "${m}" with a specific fact.`,
  },
  { rule: "meta", severity: "error", re: phraseRe(META_PHRASES), message: (m) => `Remove the commentary "${m}".` },
  { rule: "meta", severity: "error", re: GENERATED_RE, message: (m) => `Remove the commentary "${m}".` },
];

const PLACEHOLDER_RE = /\[[^\]\n]{1,60}\]/g;

function excerpt(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 30), index + length + 30).trim();
}

function issue(rule: Rule | Pick<Rule, "rule" | "severity">, message: string, ex: string, doc?: DocKind): LintIssue {
  return { rule: rule.rule, message, excerpt: ex, severity: rule.severity, ...(doc ? { doc } : {}) };
}

function ruleIssues(text: string, rule: Rule, doc?: DocKind): LintIssue[] {
  const subject = rule.prepare ? rule.prepare(text) : text;
  return [...subject.matchAll(rule.re)].map((m) =>
    issue(rule, rule.message(m[0]), excerpt(subject, m.index ?? 0, m[0].length), doc),
  );
}

function numberIssues(text: string, allowed: ReadonlySet<string>, doc?: DocKind): LintIssue[] {
  const unknown = [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
  return unknown.map((n) =>
    issue(
      { rule: "number", severity: "error" },
      `Remove the number ${n} because it does not appear in the CV or the advert.`,
      excerpt(text, Math.max(0, text.indexOf(n)), n.length),
      doc,
    ),
  );
}

function placeholderIssues(text: string, doc?: DocKind): LintIssue[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) =>
    issue(
      { rule: "placeholder", severity: "error" },
      `Replace the placeholder ${m[0]} with real content.`,
      excerpt(text, m.index ?? 0, m[0].length),
      doc,
    ),
  );
}

/** Checks one string against the house text rules. */
export function lintText(text: string, opts: LintOptions = {}): LintIssue[] {
  return [
    ...RULES.flatMap((rule) => ruleIssues(text, rule, opts.doc)),
    ...(opts.allowedNumbers ? numberIssues(text, opts.allowedNumbers, opts.doc) : []),
    ...(opts.allowPlaceholders ? [] : placeholderIssues(text, opts.doc)),
  ];
}

/** Lints the title, every heading, meta line and sentence of a document, tagging each issue with its kind. */
export function lintDocument(doc: DraftDocument, opts: LintOptions = {}): LintIssue[] {
  const strings = [
    doc.title,
    ...doc.sections.flatMap((s) => [s.heading, s.meta ?? "", ...s.items.map((i) => i.text)]),
  ].filter((s) => s.length > 0);
  return strings.flatMap((s) => lintText(s, { ...opts, doc: doc.kind }));
}

export function hasErrors(issues: readonly LintIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
