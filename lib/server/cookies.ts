import "server-only";
import { cookies } from "next/headers";
import type { CandidatePrefs } from "@/lib/types";
import type { Store } from "@/lib/store/types";

// Anonymous visitors hold two cookies: a capability for their draft CV and their search prefs.
// Neither contains CV content. Both are httpOnly.

export const DRAFT_COOKIE = "jm_draft";
export const PREFS_COOKIE = "jm_prefs";
const WEEK = 7 * 24 * 3600;

const base = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: WEEK,
});

export async function readDraftCookie(): Promise<{ id: string; token: string } | null> {
  const raw = (await cookies()).get(DRAFT_COOKIE)?.value;
  const [id, token] = raw?.split(".") ?? [];
  return id && token ? { id, token } : null;
}

export async function writeDraftCookie(id: string, token: string) {
  (await cookies()).set(DRAFT_COOKIE, `${id}.${token}`, base());
}

export async function clearDraftCookie() {
  (await cookies()).delete(DRAFT_COOKIE);
}

export function parsePrefs(raw: string | undefined): CandidatePrefs {
  try {
    const p = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    return {
      country: typeof p.country === "string" && /^[A-Z]{2}$/.test(p.country) ? p.country : undefined,
      location: typeof p.location === "string" ? p.location.slice(0, 80) : undefined,
      remoteOnly: p.remoteOnly === true,
    };
  } catch {
    return {};
  }
}

export async function readPrefsCookie(): Promise<CandidatePrefs> {
  return parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
}

export async function writePrefsCookie(prefs: CandidatePrefs) {
  (await cookies()).set(PREFS_COOKIE, JSON.stringify(prefs), base());
}

/** Moves an anonymous upload onto the signed in account. Call only from actions or route handlers. */
export async function claimPendingDraft(store: Store): Promise<boolean> {
  const draft = await readDraftCookie();
  if (!draft) return false;
  const claimed = await store.claimDraft(draft.id, draft.token).catch(() => false);
  if (claimed) {
    const prefs = await readPrefsCookie();
    const profile = await store.getProfile();
    if (profile && Object.keys(prefs).length) await store.saveProfile(profile.cv, { ...profile.prefs, ...prefs });
  }
  await clearDraftCookie();
  return claimed;
}
