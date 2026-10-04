import { z } from "zod";
import type { Evidence, ParsedCV, ProjectEntry } from "@/lib/types";
import { extractSkills } from "@/lib/skills";

// Imports public repositories as portfolio evidence. Public API only, no OAuth, no private repos.

const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const RepoSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000).nullable(),
  html_url: z.string().url(),
  homepage: z.string().nullable().optional(),
  language: z.string().nullable(),
  topics: z.array(z.string()).optional(),
  fork: z.boolean(),
  archived: z.boolean(),
  stargazers_count: z.number(),
  pushed_at: z.string(),
});

export interface GithubRepo {
  name: string;
  description: string;
  url: string;
  language: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_username" | "not_found" | "rate_limited" | "unavailable",
  ) {
    super(message);
    this.name = "GithubError";
  }
}

export function parseGithubUsername(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  const fromUrl = trimmed.match(/github\.com\/([^/?#]+)/i)?.[1];
  const name = (fromUrl ?? trimmed).replace(/^@/, "");
  return USERNAME.test(name) ? name : null;
}

export async function fetchGithubRepos(
  input: string,
  deps: { fetch: typeof fetch; token?: string; timeoutMs?: number },
): Promise<GithubRepo[]> {
  const user = parseGithubUsername(input);
  if (!user) throw new GithubError("Enter a GitHub username or profile link.", "invalid_username");
  const res = await deps.fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=50&type=owner`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(deps.token ? { Authorization: `Bearer ${deps.token}` } : {}),
    },
    signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
  });
  if (res.status === 404) throw new GithubError("That GitHub account was not found.", "not_found");
  if (res.status === 403 || res.status === 429) throw new GithubError("GitHub is rate limiting requests. Try again in an hour.", "rate_limited");
  if (!res.ok) throw new GithubError("GitHub could not be reached. Try again later.", "unavailable");
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new GithubError("GitHub returned an unexpected response.", "unavailable");
  return body
    .map((r) => RepoSchema.safeParse(r))
    .flatMap((r) => (r.success && !r.data.fork && !r.data.archived && r.data.description ? [r.data] : []))
    .map((r) => ({
      name: r.name,
      description: r.description ?? "",
      url: r.html_url,
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      pushedAt: r.pushed_at,
    }));
}

/** Repo text as it will appear in documents, cleaned of characters the house style forbids. */
function repoLine(r: GithubRepo): string {
  const desc = r.description
    .replace(/[–—]|\s-\s|--/g, ", ")
    .replace(/[;:]/g, ",")
    .replace(/[!]+/g, ".")
    .replace(/\*\*|__/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
  const tech = r.language ? ` Built with ${r.language}.` : "";
  return `${r.name.replace(/[-_]+/g, " ")}, ${desc.replace(/\.$/, "")}.${tech}`;
}

/**
 * Replaces previously imported GitHub evidence with the given repos. CV evidence keeps its ids,
 * repo lines get the next free ids, and skills are recomputed so matching can use them.
 */
export function mergeGithubEvidence(cv: ParsedCV, repos: GithubRepo[], max = 8): ParsedCV {
  const kept = cv.evidence.filter((e) => e.source !== "github");
  const keptIds = new Set(kept.map((e) => e.id));
  let next = Math.max(0, ...kept.map((e) => Number(e.id.replace(/\D/g, "")) || 0)) + 1;
  const added: Evidence[] = repos.slice(0, max).map((r) => ({
    id: `E${next++}`,
    section: "project",
    text: repoLine(r),
    source: "github",
    link: r.url,
  }));
  const evidence = [...kept, ...added];
  const skillEvidence: Record<string, string[]> = {};
  for (const e of evidence) for (const s of extractSkills(e.text)) skillEvidence[s] = [...(skillEvidence[s] ?? []), e.id];
  const projects: ProjectEntry[] = [
    ...cv.projects.filter((p) => p.evidenceIds.every((id) => keptIds.has(id))),
    ...added.map((e, i) => ({ title: repos[i].name.replace(/[-_]+/g, " "), evidenceIds: [e.id] })),
  ];
  const skills = [...new Set([...cv.skills, ...Object.keys(skillEvidence)])];
  return { ...cv, evidence, skillEvidence, projects, skills };
}
