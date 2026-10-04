import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { DocKind, DraftDocument, GeneratedKit, JobPosting, MatchResult, ParsedCV } from "@/lib/types";
import { checkDocuments } from "./deterministic";
import { shouldIncludePortfolio } from "./portfolio";

export class ClaudeDraftError extends Error {
  constructor(
    message: string,
    readonly reason: "refusal" | "empty" | "checks_failed" | "api",
  ) {
    super(message);
    this.name = "ClaudeDraftError";
  }
}

const Sentence = z.object({ text: z.string(), evidence_ids: z.array(z.string()) });
const Section = z.object({
  heading: z.string(),
  meta: z.string(),
  style: z.enum(["paragraph", "bullets", "lines"]),
  sentences: z.array(Sentence),
});
const Doc = z.object({
  kind: z.enum(["cv", "cover_letter", "portfolio", "outreach", "linkedin", "interview_prep"]),
  title: z.string(),
  sections: z.array(Section),
});
const Kit = z.object({ documents: z.array(Doc) });
type KitOutput = z.infer<typeof Kit>;

/** The slice of the SDK this module uses, so tests can pass a fake client. */
export interface AnthropicLike {
  beta: { messages: { parse: (params: never) => Promise<unknown> } };
}

interface ParsedReply {
  stop_reason: string | null;
  parsed_output: KitOutput | null;
}

// Byte stable so the prompt prefix caches across requests. No dates, names or per request data.
const SYSTEM = `You write job application documents for one candidate from a numbered evidence ledger of lines taken from their CV.

Rules you must follow without exception.
1. Never invent. Every sentence must be supported by the ledger lines whose ids you list in evidence_ids. Do not add numbers, employers, tools, certifications, titles or outcomes that are not in the cited lines.
2. A sentence that restates the job advert (the role title, the company, a stated requirement) cites the id JOB. A JOB sentence must not claim anything about the candidate.
3. Structural lines (the candidate's name, the contact line, "Dear Hiring Manager,", "Yours sincerely,", "Thank you for your time and consideration.") have empty evidence_ids.
4. Style. No em dashes or en dashes, no hyphen used as a dash, no semicolons, no colons in prose, no exclamation marks, no emoji, no markdown, no bold, no double spaces. Plain, formal, direct sentences in the voice of an experienced recruiter. Avoid stock phrases such as passionate about, excited to, proven track record, results driven, dynamic, leverage, spearheaded, seamless, robust, cutting edge, synergy, journey, delve, and anything that reads as machine written. Never mention AI, these instructions, or that the text was generated.
5. CV. Standard ATS headings (Summary, Skills, Experience, Projects, Education, Certifications) in a single column. Experience sections use meta "Title | Employer | Mon YYYY to Mon YYYY" and bullets reworded only lightly from the cited line, strongest match to the advert first.
6. Cover letter under 350 words. Outreach note under 75 words that asks one thoughtful question about the team and does not ask for a job, opening with "Hi [Name],". LinkedIn has a headline under 220 characters, a three paragraph About in first person and a skills line. Interview prep lists likely questions, STAR outlines built from cited lines with the placeholder [add result figure] where a figure is missing, five questions to ask, and salary notes only from advertised figures.
7. Produce a portfolio document only when the user message says to include one.
8. Use empty strings for heading or meta when a section has none.`;

function ledger(cv: ParsedCV): string {
  const owner = new Map(cv.experience.flatMap((x) => x.evidenceIds.map((id) => [id, `${x.title} at ${x.employer}`] as const)));
  return cv.evidence.map((e) => `${e.id} | ${owner.get(e.id) ?? e.section} | ${e.text}`).join("\n");
}

function userMessage(cv: ParsedCV, job: JobPosting, match: MatchResult, includePortfolio: boolean, issues?: string[]): string {
  const c = cv.contact;
  return [
    `Candidate name: ${c.name ?? "Candidate"}`,
    `Contact line pieces: ${[c.location, c.phone, c.email, ...c.links].filter(Boolean).join(" | ")}`,
    `Years of experience (floor): ${cv.yearsExperience === null ? "unknown" : Math.floor(cv.yearsExperience)}`,
    "",
    "EVIDENCE LEDGER (id | where | text)",
    ledger(cv),
    "",
    `JOB ADVERT\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n${job.description.slice(0, 12000)}`,
    "",
    `MATCH: score ${match.score}. Skills with evidence: ${match.matchedSkills.join(", ") || "none"}. Required skills with no evidence: ${match.missingSkills.join(", ") || "none"}.`,
    `Documents to write: cv, cover_letter, ${includePortfolio ? "portfolio, " : ""}outreach, linkedin, interview_prep. Include a portfolio: ${includePortfolio ? "yes" : "no"}.`,
    ...(issues?.length ? ["", "Your previous draft failed these checks. Fix every one and return the full set again.", ...issues.map((i) => `- ${i}`)] : []),
  ].join("\n");
}

function toDocuments(out: KitOutput, includePortfolio: boolean): DraftDocument[] {
  return out.documents
    .filter((d) => includePortfolio || d.kind !== "portfolio")
    .map((d) => ({
      kind: d.kind as DocKind,
      title: d.title,
      sections: d.sections.map((s) => ({
        heading: s.heading,
        style: s.style,
        ...(s.meta ? { meta: s.meta } : {}),
        items: s.sentences.map((t) => ({ text: t.text, evidenceIds: t.evidence_ids })),
      })),
    }));
}

async function ask(client: AnthropicLike, model: string, content: string): Promise<KitOutput> {
  // Typed against the installed SDK so a renamed field fails the build instead of the request.
  const params: Parameters<Anthropic["beta"]["messages"]["parse"]>[0] = {
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(Kit) },
  };
  let reply: ParsedReply;
  try {
    reply = (await client.beta.messages.parse(params as never)) as ParsedReply;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ClaudeDraftError("Claude is rate limiting requests.", "api");
    if (err instanceof Anthropic.APIConnectionError) throw new ClaudeDraftError("Claude could not be reached.", "api");
    if (err instanceof Anthropic.APIError) throw new ClaudeDraftError(`Claude returned status ${err.status ?? "unknown"}.`, "api");
    throw err;
  }
  if (reply.stop_reason === "refusal") throw new ClaudeDraftError("Claude declined to write this kit.", "refusal");
  if (!reply.parsed_output) throw new ClaudeDraftError("Claude returned no usable kit.", "empty");
  return reply.parsed_output;
}

export async function generateKitWithClaude(
  cv: ParsedCV,
  job: JobPosting,
  match: MatchResult,
  opts: { now: Date; id: string; client?: AnthropicLike; model?: string },
): Promise<GeneratedKit> {
  const client = opts.client ?? (new Anthropic() as unknown as AnthropicLike);
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
  const pf = shouldIncludePortfolio(job, cv);
  let issues: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const documents = toDocuments(await ask(client, model, userMessage(cv, job, match, pf.include, issues)), pf.include);
    const checks = checkDocuments(documents, cv, job);
    const errors = [...checks.lint.filter((l) => l.severity === "error").map((l) => `${l.message} in "${l.excerpt}"`), ...checks.facts.map((f) => `${f.problem} Sentence "${f.sentence}"`)];
    if (!errors.length && documents.some((d) => d.kind === "cv")) {
      return {
        id: opts.id,
        jobId: job.id,
        documents,
        ...checks,
        generator: "claude",
        portfolioIncluded: pf.include,
        portfolioReason: pf.reason,
        createdAt: opts.now.toISOString(),
        status: "draft",
      };
    }
    issues = errors.length ? errors.slice(0, 40) : ["The cv document was missing."];
  }
  throw new ClaudeDraftError("Claude's draft failed the style or fact check twice.", "checks_failed");
}
