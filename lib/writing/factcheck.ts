import { extractSkills } from "@/lib/skills";
import { JOB_EVIDENCE } from "@/lib/types";
import type { DraftDocument, DraftSentence, Evidence, FactIssue, ParsedCV } from "@/lib/types";
import { mentions, unknownOrgs } from "./orgs";
import { advertNumbers, evidenceEmployers, numbersIn, yearsFloor } from "./text";

/** The advert fields the fact check reads. A JobPosting satisfies it. */
export interface AdvertFacts {
  title: string;
  company: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  skills?: string[];
}

interface Ctx {
  cv: ParsedCV;
  job?: AdvertFacts;
  evidence: Map<string, Evidence>;
  evidenceNumbers: Map<string, string[]>;
  owners: Map<string, string>;
  employers: string[];
  knownOrgs: string[];
  titles: string[];
  advertText: string;
  advertNumbers: Set<string>;
  advertSkills: Set<string>;
  cvSkills: Set<string>;
  certPool: string[];
  years: number | null;
}

const SALUTATION = /^(?:Dear|Hi|Hello)\s[^.!?]{1,40},$/;
const SIGN_OFF = /^(?:Yours sincerely|Yours faithfully|Kind regards|Regards|Best regards|Many thanks|Thank you),?$/i;
const THANKS = /^Thank you for (?:your time|considering)[^.!?]{0,60}\.$/;
const FIRST_PERSON_CLAIM =
  /\b(?:I|we)(?:'ve| have| had| was| were)\b|\b(?:I|we) (?:\w+ed|led|built|ran|made|grew|won|wrote|drove|took|brought|cut|sold)\b|\b(?:my|our)\b/i;
const CERT_WORDS = /\b(?:certified|certifications?|accredited|accreditation)\b/i;
const CERT_STOP = new Set(["certified", "certification", "certificate", "accredited", "professional", "associate", "the", "and", "for", "with"]);

function buildCtx(cv: ParsedCV, job?: AdvertFacts): Ctx {
  const advertText = job ? `${job.title}\n${job.company}\n${job.description}` : "";
  const employers = [...new Set(cv.experience.map((x) => x.employer).filter(Boolean))];
  return {
    cv,
    job,
    evidence: new Map(cv.evidence.map((e) => [e.id, e])),
    evidenceNumbers: new Map(cv.evidence.map((e) => [e.id, numbersIn(e.text)])),
    owners: evidenceEmployers(cv),
    employers,
    knownOrgs: [...employers, ...cv.education.map((x) => x.institution), ...(job ? [job.company] : [])].filter(Boolean),
    titles: [...cv.experience.map((x) => x.title), ...cv.projects.map((p) => p.title), ...(job ? [job.title] : [])],
    advertText,
    advertNumbers: job ? advertNumbers(job) : new Set(),
    advertSkills: new Set([...extractSkills(advertText), ...(job?.skills ?? [])]),
    cvSkills: new Set(cv.skills),
    certPool: [...cv.certifications, ...cv.evidence.filter((e) => e.section === "certification").map((e) => e.text)],
    years: yearsFloor(cv),
  };
}

function isStructural(text: string, cv: ParsedCV): boolean {
  const t = text.trim();
  if (SALUTATION.test(t) || SIGN_OFF.test(t) || THANKS.test(t)) return true;
  const c = cv.contact;
  const contact = [c.name, c.email, c.phone, c.location, ...c.links].filter(Boolean).map((s) => String(s).trim().toLowerCase());
  return t.split(/\s+\|\s+/).every((part) => contact.includes(part.toLowerCase()));
}

function isYearsFigure(text: string, n: string, years: number | null): boolean {
  return years !== null && n === String(years) && new RegExp(`(?<![\\d.])${n}\\+?\\s+years?\\b`, "i").test(text);
}

function numberProblems(text: string, cited: Evidence[], usesJob: boolean, ctx: Ctx): string[] {
  const allowed = new Set([
    ...cited.flatMap((e) => ctx.evidenceNumbers.get(e.id) ?? []),
    ...(usesJob ? ctx.advertNumbers : []),
  ]);
  return [...new Set(numbersIn(text))]
    .filter((n) => !allowed.has(n) && !isYearsFigure(text, n, ctx.years))
    .map((n) => `The number ${n} does not appear in the cited evidence.`);
}

function ownerProblems(text: string, ctx: Ctx): string[] {
  const named = ctx.employers.filter((e) => mentions(text, e));
  if (!named.length) return [];
  return [...new Set(numbersIn(text))]
    .filter((n) => !isYearsFigure(text, n, ctx.years))
    .flatMap((n) => {
      const owners = new Set(
        ctx.cv.evidence.filter((e) => ctx.evidenceNumbers.get(e.id)?.includes(n)).map((e) => ctx.owners.get(e.id)),
      );
      owners.delete(undefined);
      if (!owners.size) return [];
      return named
        .filter((y) => !owners.has(y))
        .map((y) => `The figure ${n} comes from work at ${[...owners].join(" or ")}, not ${y}.`);
    });
}

function orgProblems(text: string, cited: Evidence[], jobOnly: boolean, ctx: Ctx): string[] {
  const cvOrgs = ctx.knownOrgs.filter((o) => o !== ctx.job?.company);
  const strayCvOrgs = jobOnly
    ? cvOrgs.filter((o) => mentions(text, o) && !mentions(ctx.advertText, o))
        .map((o) => `The sentence cites only the advert but names ${o}, which the advert does not mention.`)
    : [];
  const sources = jobOnly ? [ctx.advertText] : cited.map((e) => e.text);
  const unknown = unknownOrgs(text, ctx.knownOrgs, ctx.titles)
    .filter((o) => !sources.some((s) => mentions(s, o)))
    .map((o) => `The organisation ${o} is not a CV employer, a CV institution or the hiring company.`);
  return [...strayCvOrgs, ...unknown];
}

function skillProblems(text: string, usesJob: boolean, jobOnly: boolean, ctx: Ctx): string[] {
  return extractSkills(text)
    .filter((s) => (jobOnly ? !ctx.advertSkills.has(s) : !ctx.cvSkills.has(s) && !(usesJob && ctx.advertSkills.has(s))))
    .map((s) => (jobOnly ? `The skill ${s} is not in the advert.` : `The skill ${s} is not in the CV.`));
}

function certProblems(text: string, ctx: Ctx): string[] {
  if (!CERT_WORDS.test(text)) return [];
  const words = new Set(text.toLowerCase().match(/[a-z0-9+#]+/g) ?? []);
  const matches = ctx.certPool.some((cert) => {
    const tokens = (cert.toLowerCase().match(/[a-z0-9+#]+/g) ?? []).filter((t) => t.length >= 2 && !CERT_STOP.has(t));
    return tokens.some((t) => words.has(t));
  });
  return matches ? [] : ["The sentence mentions a certification that is not listed in the CV."];
}

function checkSentence(item: DraftSentence, ctx: Ctx): string[] {
  if (item.evidenceIds.length === 0) {
    return isStructural(item.text, ctx.cv) ? [] : ["The sentence makes a claim but cites no evidence."];
  }
  const unknownIds = item.evidenceIds.filter((id) => id !== JOB_EVIDENCE && !ctx.evidence.has(id));
  if (unknownIds.length) return unknownIds.map((id) => `The evidence id ${id} does not exist in the CV.`);
  const usesJob = item.evidenceIds.includes(JOB_EVIDENCE);
  if (usesJob && !ctx.job) return ["The sentence cites the advert but no advert was supplied to check it."];
  const cited = item.evidenceIds.filter((id) => id !== JOB_EVIDENCE).map((id) => ctx.evidence.get(id) as Evidence);
  const jobOnly = usesJob && cited.length === 0;
  return [
    ...(jobOnly && FIRST_PERSON_CLAIM.test(item.text)
      ? ["The sentence cites only the advert but makes a claim about the candidate."]
      : []),
    ...numberProblems(item.text, cited, usesJob, ctx),
    ...ownerProblems(item.text, ctx),
    ...orgProblems(item.text, cited, jobOnly, ctx),
    ...skillProblems(item.text, usesJob, jobOnly, ctx),
    ...certProblems(item.text, ctx),
  ];
}

/** Traces every sentence of a draft back to the CV evidence ledger or the advert. */
export function factCheck(doc: DraftDocument, cv: ParsedCV, job?: AdvertFacts): FactIssue[] {
  const ctx = buildCtx(cv, job);
  return doc.sections
    .flatMap((s) => s.items)
    .flatMap((item) => checkSentence(item, ctx).map((problem) => ({ sentence: item.text, problem, doc: doc.kind })));
}
