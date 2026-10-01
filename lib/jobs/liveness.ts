import type { JobPosting } from "@/lib/types";
import { boardKey } from "./boards";

// ponytail: Adzuna returns one search page per query, so a job missing from it may still be open.
// Those jobs close only when closesAt passes. Upgrade path is a per id lookup against Adzuna.
const PARTIAL_SOURCES = new Set<JobPosting["source"]>(["adzuna"]);

export interface Reconciled {
  /** Full rows to write. Fresh jobs keep their first seen retrievedAt. */
  upserts: JobPosting[];
  /** Ids this run closes, including fresh jobs already past their closing date. */
  closedIds: string[];
}

function isPast(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < now.getTime();
}

function earliest(a: string, b: string): string {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta <= tb ? a : b;
}

function vanished(job: JobPosting, okBoards: Set<string>, freshIds: Set<string>): boolean {
  if (freshIds.has(job.id) || !job.board || PARTIAL_SOURCES.has(job.source)) return false;
  return okBoards.has(boardKey(job.source, job.board));
}

/**
 * Merge a fresh ingest into the stored jobs. A stored open job closes when its board fetched OK but no
 * longer lists it, or when its closesAt has passed (that needs no fetch, so it applies to failed
 * boards too). Anything else from a failed board is left untouched.
 */
export function reconcile(existing: JobPosting[], fresh: JobPosting[], okBoards: string[], now: Date): Reconciled {
  const stamp = now.toISOString();
  const prior = new Map(existing.map((j) => [j.id, j]));
  const freshIds = new Set(fresh.map((j) => j.id));
  const ok = new Set(okBoards);
  const upserts = fresh.map((job): JobPosting => {
    const before = prior.get(job.id);
    return {
      ...job,
      retrievedAt: before ? earliest(before.retrievedAt, job.retrievedAt) : job.retrievedAt,
      lastCheckedAt: stamp,
      status: isPast(job.closesAt, now) ? "closed" : job.status,
    };
  });
  const closedFresh = upserts.filter((j) => j.status === "closed" && prior.get(j.id)?.status !== "closed");
  const closedStored = existing.filter(
    (j) => j.status !== "closed" && !freshIds.has(j.id) && (isPast(j.closesAt, now) || vanished(j, ok, freshIds)),
  );
  return { upserts, closedIds: [...closedFresh, ...closedStored].map((j) => j.id) };
}
