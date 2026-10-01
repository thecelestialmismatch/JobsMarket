import "server-only";
import { randomUUID } from "node:crypto";
import type { GeneratedKit } from "@/lib/types";
import { scoreMatch } from "@/lib/match";
import { monthStart, PLANS } from "@/lib/plans";
import { generateKit } from "@/lib/writing";
import type { WorkspaceWithCv } from "./workspace";

export type KitResult = { ok: true; kit: GeneratedKit } | { ok: false; error: string };

/** Quota, rate limit, generation and persistence for one application kit. */
export async function buildKit(ws: WorkspaceWithCv, jobId: string, now = new Date()): Promise<KitResult> {
  if (!(await ws.store.rateLimit("kit", 60, 5))) return { ok: false, error: "Building too many kits at once. Wait a minute." };
  const plan = await ws.store.getPlan();
  const used = await ws.store.countUsage("kit", monthStart(now));
  if (used >= PLANS[plan].limits.kit) {
    return { ok: false, error: `You have used all ${PLANS[plan].limits.kit} kits for this month on the ${PLANS[plan].label} plan.` };
  }
  const job = await ws.store.getJob(jobId);
  if (!job) return { ok: false, error: "That role is no longer listed." };
  if (job.status !== "open") return { ok: false, error: "That role has closed." };
  const match = scoreMatch(ws.cv, job, ws.prefs, now);
  const kit = await generateKit(ws.cv, job, match, { now, id: randomUUID() });
  await ws.store.saveKit(kit);
  await ws.store.recordUsage("kit");
  return { ok: true, kit };
}

export function safeFileBase(name: string | undefined): string {
  return (name ?? "Candidate").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Candidate";
}
