import type { GeneratedKit, JobPosting, MatchResult, ParsedCV } from "@/lib/types";
import { generateKitWithClaude, type AnthropicLike } from "./claude";
import { generateKitDeterministic } from "./deterministic";

export { generateKitDeterministic } from "./deterministic";
export { generateKitWithClaude, ClaudeDraftError, type AnthropicLike } from "./claude";

/**
 * Claude when a key or client is available, the template generator otherwise or on any Claude
 * failure. Either way the kit carries its lint and fact check results.
 */
export async function generateKit(
  cv: ParsedCV,
  job: JobPosting,
  match: MatchResult,
  opts: { now: Date; id: string; client?: AnthropicLike },
): Promise<GeneratedKit> {
  if (opts.client || process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateKitWithClaude(cv, job, match, opts);
    } catch (err) {
      // No CV content in logs, only the failure class.
      console.warn("kit: falling back to templates", err instanceof Error ? err.name : "unknown");
    }
  }
  return generateKitDeterministic(cv, job, match, opts);
}
