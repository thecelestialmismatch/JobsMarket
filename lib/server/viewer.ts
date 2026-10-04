import "server-only";
import type { CandidatePrefs, FullMatch, ParsedCV, PreviewMatch } from "@/lib/types";
import { getBackend, type Backend } from "@/lib/backend";
import { rankMatches } from "@/lib/match";
import { toFull, toPreview } from "@/lib/gate";
import { readDraftCookie, readPrefsCookie } from "./cookies";

export interface Viewer extends Backend {
  cv: ParsedCV | null;
  prefs: CandidatePrefs;
  lastSeenAt: string | null;
}

/** Side effect free read of who is looking and which CV they have. */
export async function getViewer(): Promise<Viewer> {
  const backend = await getBackend();
  if (backend.user) {
    const profile = await backend.store.getProfile();
    return { ...backend, cv: profile?.cv ?? null, prefs: profile?.prefs ?? {}, lastSeenAt: profile?.lastSeenAt ?? null };
  }
  const draft = await readDraftCookie();
  const cv = draft ? await backend.store.getDraft(draft.id, draft.token) : null;
  return { ...backend, cv, prefs: await readPrefsCookie(), lastSeenAt: null };
}

/**
 * Anonymous viewers get PreviewMatch objects built from the anonymous job projection. The full
 * posting is never loaded on this path, so company, links and description cannot reach the page.
 */
export async function previewMatches(v: Viewer, now = new Date()): Promise<PreviewMatch[]> {
  if (!v.cv) return [];
  const features = await v.store.listJobFeatures();
  const byId = new Map(features.map((f) => [f.id, f]));
  return rankMatches(v.cv, features, v.prefs, now).map((m) => toPreview(byId.get(m.jobId)!, m));
}

export async function fullMatches(v: Viewer, now = new Date()): Promise<FullMatch[]> {
  if (!v.cv || !v.user) return [];
  const jobs = await v.store.listJobs();
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return rankMatches(v.cv, jobs, v.prefs, now).map((m) => toFull(byId.get(m.jobId)!, m, v.lastSeenAt));
}
