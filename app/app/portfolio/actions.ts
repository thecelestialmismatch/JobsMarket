"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildPortfolio, portfolioSlug } from "@/lib/portfolio/build";
import { fetchGithubRepos, GithubError, mergeGithubEvidence } from "@/lib/portfolio/github";
import { roleFamily } from "@/lib/skills";
import { requireCv, requireUser } from "@/lib/server/workspace";

export interface PortfolioState {
  error?: string;
  info?: string;
}

export async function importGithubAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await requireCv("/app/portfolio");
  if (!(await ws.store.rateLimit("github", 3600, 10))) return { error: "Too many imports this hour. Try again later." };
  try {
    const repos = await fetchGithubRepos(String(form.get("github") ?? ""), { fetch, token: process.env.GITHUB_TOKEN });
    if (!repos.length) return { error: "No public repositories with a description were found. Add descriptions on GitHub first." };
    await ws.store.saveProfile(mergeGithubEvidence(ws.cv, repos), ws.prefs);
    revalidatePath("/app/portfolio");
    return { info: `Imported ${Math.min(repos.length, 8)} repositories as project evidence.` };
  } catch (err) {
    if (err instanceof GithubError) return { error: err.message };
    throw err;
  }
}

export async function createPortfolioAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await requireCv("/app/portfolio");
  const familyId = String(form.get("family") ?? "");
  if (!roleFamily(familyId)) return { error: "Choose a role to tailor the portfolio to." };
  const existing = await ws.store.listPortfolios();
  if (existing.length >= 10) return { error: "You can keep up to ten portfolio pages. Delete one first." };
  const prev = existing.find((p) => p.roleFamily === familyId);
  const page = buildPortfolio(ws.cv, familyId, {
    id: prev?.id ?? randomUUID(),
    slug: prev?.slug ?? portfolioSlug(ws.cv.contact.name, familyId, randomBytes(4).toString("hex")),
    now: new Date(),
    includeEmail: form.get("email") === "on",
  });
  await ws.store.savePortfolio({ ...page, published: prev?.published ?? false });
  revalidatePath("/app/portfolio");
  return { info: prev ? "Portfolio rebuilt from your latest CV." : "Portfolio created. It stays private until you publish it." };
}

export async function publishPortfolioAction(form: FormData): Promise<void> {
  const ws = await requireUser("/app/portfolio");
  const page = (await ws.store.listPortfolios()).find((p) => p.id === form.get("id"));
  if (!page) return;
  await ws.store.savePortfolio({ ...page, published: form.get("publish") === "1", updatedAt: new Date().toISOString() });
  revalidatePath("/app/portfolio");
  revalidatePath(`/p/${page.slug}`);
}

export async function deletePortfolioAction(form: FormData): Promise<void> {
  const ws = await requireUser("/app/portfolio");
  await ws.store.deletePortfolio(String(form.get("id") ?? ""));
  revalidatePath("/app/portfolio");
}
