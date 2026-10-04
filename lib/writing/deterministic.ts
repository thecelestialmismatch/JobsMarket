import type {
  DraftDocument,
  DraftSection,
  DraftSentence,
  Evidence,
  ExperienceEntry,
  GeneratedKit,
  JobPosting,
  MatchResult,
  ParsedCV,
} from "@/lib/types";
import { JOB_EVIDENCE } from "@/lib/types";
import { extractSkills, roleFamily } from "@/lib/skills";
import { factCheck } from "./factcheck";
import { lintDocument, lintText } from "./lint";
import { shouldIncludePortfolio } from "./portfolio";
import { allowedNumbers, cleanEvidence, cleanLabel, coreTitle, formatThousands, joinList, startsWithPastTense, withPeriod, wordCount, yearsFloor } from "./text";

// Template generator. Runs with no API key and is the fallback whenever Claude output fails a check.
// Every claim is an evidence line (lightly cleaned) or a template filled only with CV and advert facts.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORK_RIGHTS = /\b(?:working rights|work rights|right to work|visa|citizen|permanent resident)\b/i;

interface Ctx {
  cv: ParsedCV;
  job: JobPosting;
  match: MatchResult;
  allowed: Set<string>;
  usable: Map<string, string>; // evidence id to cleaned text that passes the style check
}

const s = (text: string, evidenceIds: string[] = []): DraftSentence => ({ text, evidenceIds });

function fmtMonth(ym: string | undefined): string {
  if (!ym) return "";
  if (ym === "present") return "Present";
  const [y, m] = ym.split("-");
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

function buildCtx(cv: ParsedCV, job: JobPosting, match: MatchResult): Ctx {
  const allowed = allowedNumbers(cv, job);
  const usable = new Map<string, string>();
  for (const e of cv.evidence) {
    const text = withPeriod(cleanEvidence(e.text));
    if (text.length > 3 && !lintText(text, { allowedNumbers: allowed }).some((i) => i.severity === "error")) usable.set(e.id, text);
  }
  return { cv, job, match, allowed, usable };
}

/** Relevance of a line to the advert: required skills count double. */
function relevance(text: string, job: JobPosting): number {
  const req = new Set(job.requirements.requiredSkills);
  const nice = new Set(job.requirements.niceSkills);
  return extractSkills(text).reduce((sum, sk) => sum + (req.has(sk) ? 2 : nice.has(sk) ? 1 : 0), 0);
}

function roleLines(ctx: Ctx, x: ExperienceEntry, max: number): DraftSentence[] {
  return x.evidenceIds
    .filter((id) => ctx.usable.has(id))
    .map((id, order) => ({ id, order, score: relevance(ctx.usable.get(id)!, ctx.job) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map(({ id }) => s(ctx.usable.get(id)!, [id]));
}

function bestBullets(ctx: Ctx, n: number, pastTenseOnly: boolean): { e: Evidence; text: string; employer: string }[] {
  const owner = new Map(ctx.cv.experience.flatMap((x) => x.evidenceIds.map((id) => [id, x.employer] as const)));
  return ctx.cv.evidence
    .filter((e) => e.section === "experience" && ctx.usable.has(e.id) && owner.has(e.id))
    .map((e, order) => ({ e, order, text: ctx.usable.get(e.id)!, employer: owner.get(e.id)!, score: relevance(e.text, ctx.job) }))
    .filter((b) => !pastTenseOnly || startsWithPastTense(b.text))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, n);
}

function skillIds(ctx: Ctx, skills: string[]): string[] {
  return [...new Set(skills.flatMap((sk) => (ctx.cv.skillEvidence[sk] ?? []).slice(0, 1)))];
}

function header(cv: ParsedCV): DraftSection {
  const c = cv.contact;
  const contact = [c.location, c.phone, c.email, ...c.links].filter((x): x is string => Boolean(x)).join(" | ");
  return { heading: "", style: "lines", items: [s(c.name ?? "Candidate"), ...(contact ? [s(contact)] : [])] };
}

function summary(ctx: Ctx): DraftSection {
  const { cv, match } = ctx;
  const recent = cv.experience[0];
  const employers = [...new Set(cv.experience.map((x) => cleanLabel(x.employer)))].slice(0, 3);
  const years = yearsFloor(cv);
  const items: DraftSentence[] = [];
  if (recent) {
    const ids = cv.experience.slice(0, 3).flatMap((x) => x.evidenceIds.slice(0, 1));
    const yearsPart = years && years > 0 ? ` with ${years} years of experience` : "";
    items.push(s(`${cleanLabel(recent.title)}${yearsPart} at ${joinList(employers)}.`, ids.length ? ids : [cv.evidence[0]?.id ?? ""]));
  }
  const strengths = match.matchedSkills.slice(0, 4);
  if (strengths.length) items.push(s(`Hands on experience with ${joinList(strengths)}.`, skillIds(ctx, strengths)));
  const own = cv.evidence.find((e) => e.section === "summary" && ctx.usable.has(e.id));
  if (own) items.push(s(ctx.usable.get(own.id)!, [own.id]));
  return { heading: "Summary", style: "paragraph", items: items.filter((i) => i.evidenceIds.every(Boolean)) };
}

function skillsSection(ctx: Ctx): DraftSection | null {
  const ordered = [...new Set([...ctx.match.matchedSkills, ...ctx.cv.skills])].slice(0, 14);
  const withEvidence = ordered.filter((sk) => (ctx.cv.skillEvidence[sk] ?? []).length);
  if (!withEvidence.length) return null;
  return { heading: "Skills", style: "lines", items: [s(withEvidence.join(", "), skillIds(ctx, withEvidence))] };
}

function linesFor(ctx: Ctx, section: Evidence["section"], heading: string): DraftSection | null {
  const items = ctx.cv.evidence.filter((e) => e.section === section && ctx.usable.has(e.id)).map((e) => s(ctx.usable.get(e.id)!, [e.id]));
  return items.length ? { heading, style: "lines", items } : null;
}

function cvDocument(ctx: Ctx): DraftDocument {
  const roles: DraftSection[] = ctx.cv.experience.slice(0, 5).map((x, i) => ({
    heading: i === 0 ? "Experience" : "",
    meta: [cleanLabel(x.title), cleanLabel(x.employer), [fmtMonth(x.start), fmtMonth(x.end)].filter(Boolean).join(" to ")]
      .filter(Boolean)
      .join(" | "),
    style: "bullets" as const,
    items: roleLines(ctx, x, i < 2 ? 6 : 3),
  }));
  const projects: DraftSection[] = ctx.cv.projects.slice(0, 4).flatMap((p, i) => {
    const items = p.evidenceIds.filter((id) => ctx.usable.has(id)).map((id) => s(ctx.usable.get(id)!, [id]));
    return items.length ? [{ heading: i === 0 ? "Projects" : "", meta: cleanLabel(p.title), style: "bullets" as const, items }] : [];
  });
  const sections = [
    header(ctx.cv),
    summary(ctx),
    skillsSection(ctx),
    ...roles.filter((r) => r.items.length),
    ...projects,
    linesFor(ctx, "education", "Education"),
    linesFor(ctx, "certification", "Certifications"),
  ].filter((x): x is DraftSection => x !== null && x.items.length > 0);
  return { kind: "cv", title: "CV", sections };
}

function coverLetter(ctx: Ctx): DraftDocument {
  const { cv, job, match } = ctx;
  const role = coreTitle(job.title);
  const company = cleanLabel(job.company);
  const opener: DraftSentence[] = [s(`I am applying for the ${role} role at ${company}.`, [JOB_EVIDENCE])];
  const top = match.matchedSkills.slice(0, 3);
  if (top.length) opener.push(s(`My experience covers ${joinList(top)}, which the role lists as requirements.`, [JOB_EVIDENCE, ...skillIds(ctx, top)]));
  else if (cv.experience[0]?.evidenceIds[0]) {
    const x = cv.experience[0];
    opener.push(s(`I have worked as ${cleanLabel(x.title)} at ${cleanLabel(x.employer)}.`, [x.evidenceIds[0]]));
  }
  const bullets = bestBullets(ctx, 4, true);
  const asClaim = (b: (typeof bullets)[number]) => s(`At ${cleanLabel(b.employer)}, I ${lowerFirst(b.text)}`, [b.e.id]);
  const rights = cv.evidence.find((e) => WORK_RIGHTS.test(e.text) && ctx.usable.has(e.id));
  const sections: DraftSection[] = [
    { heading: "", style: "lines", items: [s("Dear Hiring Manager,")] },
    { heading: "", style: "paragraph", items: opener },
    ...(bullets.length ? [{ heading: "", style: "paragraph" as const, items: bullets.slice(0, 2).map(asClaim) }] : []),
    ...(bullets.length > 2 || rights
      ? [{ heading: "", style: "paragraph" as const, items: [...bullets.slice(2, 3).map(asClaim), ...(rights ? [s(ctx.usable.get(rights.id)!, [rights.id])] : [])] }]
      : []),
    {
      heading: "",
      style: "paragraph",
      items: [s(`I would welcome the chance to discuss the ${role} role with you.`, [JOB_EVIDENCE]), s("Thank you for your time and consideration.")],
    },
    { heading: "", style: "lines", items: [s("Yours sincerely,"), s(cv.contact.name ?? "Candidate")] },
  ];
  return { kind: "cover_letter", title: "Cover letter", sections };
}

function outreach(ctx: Ctx): DraftDocument {
  const { job, cv } = ctx;
  const role = coreTitle(job.title);
  const proof = bestBullets(ctx, 3, true).find((b) => wordCount(b.text) <= 24);
  const items: DraftSentence[] = [
    s(`I saw that ${cleanLabel(job.company)} is hiring a ${role} and wanted to learn more about the team.`, [JOB_EVIDENCE]),
    ...(proof ? [s(`At ${cleanLabel(proof.employer)}, I ${lowerFirst(proof.text)}`, [proof.e.id])] : []),
    s("What does good work look like for someone in this role during the first few months?", [JOB_EVIDENCE]),
    s("Thank you for considering my note."),
  ];
  return {
    kind: "outreach",
    title: "Outreach note",
    sections: [
      { heading: "", style: "lines", items: [s("Hi [Name],")] },
      { heading: "", style: "paragraph", items },
      { heading: "", style: "lines", items: [s(cv.contact.name ?? "Candidate")] },
    ],
  };
}

function linkedin(ctx: Ctx): DraftDocument {
  const { cv, job } = ctx;
  const recent = cv.experience[0];
  const skills = [...new Set([...ctx.match.matchedSkills, ...cv.skills])].filter((sk) => (cv.skillEvidence[sk] ?? []).length).slice(0, 15);
  const headlineSkills = skills.slice(0, 3);
  const headline = [recent ? cleanLabel(recent.title) : null, ...headlineSkills].filter(Boolean).join(" | ").slice(0, 220);
  const years = yearsFloor(cv);
  const employers = [...new Set(cv.experience.map((x) => cleanLabel(x.employer)))].slice(0, 3);
  const family = job.requirements.roleFamily ? roleFamily(job.requirements.roleFamily)?.label : null;
  const about: DraftSection[] = [];
  if (recent) {
    about.push({
      heading: "About",
      style: "paragraph",
      items: [
        s(
          `I am a ${cleanLabel(recent.title)}${years && years > 0 ? ` with ${years} years of experience` : ""} at ${joinList(employers)}.`,
          cv.experience.slice(0, 3).flatMap((x) => x.evidenceIds.slice(0, 1)),
        ),
      ],
    });
  }
  const proof = bestBullets(ctx, 2, true);
  if (proof.length) about.push({ heading: about.length ? "" : "About", style: "paragraph", items: proof.map((b) => s(`At ${cleanLabel(b.employer)}, I ${lowerFirst(b.text)}`, [b.e.id])) });
  if (family) about.push({ heading: "", style: "paragraph", items: [s(`Open to ${family} roles.`, [JOB_EVIDENCE])] });
  return {
    kind: "linkedin",
    title: "LinkedIn profile",
    sections: [
      ...(headline && headlineSkills.length ? [{ heading: "Headline", style: "lines" as const, items: [s(headline, skillIds(ctx, headlineSkills))] }] : []),
      ...about,
      ...(skills.length ? [{ heading: "Top skills", style: "lines" as const, items: [s(skills.join(", "), skillIds(ctx, skills))] }] : []),
    ].filter((x) => x.items.every((i) => i.evidenceIds.length)),
  };
}

const QUESTIONS_TO_ASK = [
  "How will you measure success in this role over the first six months?",
  "What is the biggest problem the team needs this person to solve first?",
  "How does the team decide what to work on each week?",
  "What does the path from this role look like for people who do well?",
  "What would you want the person in this role to start doing differently?",
];

function interviewPrep(ctx: Ctx): DraftDocument {
  const { job, cv } = ctx;
  const req = job.requirements.requiredSkills.slice(0, 5);
  const questions: DraftSentence[] = [
    ...req.map((sk) => s(`Walk me through a time you used ${sk} to solve a real problem.`, [JOB_EVIDENCE])),
    s(`Why do you want this ${coreTitle(job.title)} role?`, [JOB_EVIDENCE]),
    s("Tell me about a time you had to change course because the facts changed.", [JOB_EVIDENCE]),
  ];
  const owner = new Map(cv.experience.flatMap((x) => x.evidenceIds.map((id) => [id, x] as const)));
  const stories: DraftSection[] = bestBullets(ctx, 3, false).map((b, i) => {
    const x = owner.get(b.e.id);
    return {
      heading: i === 0 ? "Stories to prepare" : "",
      meta: x ? `${cleanLabel(x.title)} | ${cleanLabel(x.employer)}` : cleanLabel(b.employer),
      style: "lines" as const,
      items: [
        s(`Situation and task. Your work as ${x ? cleanLabel(x.title) : "part of the team"} at ${cleanLabel(b.employer)}.`, [b.e.id]),
        s(`Action. ${b.text}`, [b.e.id]),
        s("Result. State the outcome and the measure, for example [add result figure].", [b.e.id]),
      ],
    };
  });
  const salary =
    job.salaryMin || job.salaryMax
      ? [
          {
            heading: "Salary preparation",
            style: "paragraph" as const,
            items: [
              s(
                `The advertised range is ${job.salaryCurrency ?? ""} ${[job.salaryMin, job.salaryMax].filter((n): n is number => Boolean(n)).map(formatThousands).join(" to ")}${job.salaryPeriod && job.salaryPeriod !== "year" ? ` per ${job.salaryPeriod}` : ""}.`.replace(/\s+/g, " "),
                [JOB_EVIDENCE],
              ),
              s("Decide your number before the call and anchor near the top of the range.", [JOB_EVIDENCE]),
            ],
          },
        ]
      : [];
  return {
    kind: "interview_prep",
    title: "Interview prep",
    sections: [
      { heading: "Questions to expect", style: "bullets", items: questions },
      ...stories,
      { heading: "Questions to ask them", style: "bullets", items: QUESTIONS_TO_ASK.map((q) => s(q, [JOB_EVIDENCE])) },
      ...salary,
    ],
  };
}

function portfolio(ctx: Ctx): DraftDocument {
  const sections: DraftSection[] = ctx.cv.projects.flatMap((p, i) => {
    const items = p.evidenceIds.filter((id) => ctx.usable.has(id)).map((id) => s(ctx.usable.get(id)!, [id]));
    return items.length ? [{ heading: i === 0 ? "Selected work" : "", meta: cleanLabel(p.title), style: "bullets" as const, items }] : [];
  });
  return { kind: "portfolio", title: "Portfolio", sections: [header(ctx.cv), ...sections] };
}

export function checkDocuments(docs: DraftDocument[], cv: ParsedCV, job: JobPosting) {
  const allowed = allowedNumbers(cv, job);
  return {
    lint: docs.flatMap((d) => lintDocument(d, { allowedNumbers: allowed, allowPlaceholders: d.kind === "outreach" || d.kind === "interview_prep", doc: d.kind })),
    facts: docs.flatMap((d) => factCheck(d, cv, job)),
  };
}

export function generateKitDeterministic(cv: ParsedCV, job: JobPosting, match: MatchResult, opts: { now: Date; id: string }): GeneratedKit {
  const ctx = buildCtx(cv, job, match);
  const pf = shouldIncludePortfolio(job, cv);
  const documents = [cvDocument(ctx), coverLetter(ctx), ...(pf.include ? [portfolio(ctx)] : []), outreach(ctx), linkedin(ctx), interviewPrep(ctx)];
  return {
    id: opts.id,
    jobId: job.id,
    documents,
    ...checkDocuments(documents, cv, job),
    generator: "deterministic",
    portfolioIncluded: pf.include,
    portfolioReason: pf.reason,
    createdAt: opts.now.toISOString(),
    status: "draft",
  };
}
