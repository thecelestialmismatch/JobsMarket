import type { CandidatePrefs } from "@/lib/types";
import { getBackend } from "@/lib/backend";
import { CvError, extractText, MAX_UPLOAD_BYTES } from "@/lib/cv/extract";
import { parseCv } from "@/lib/cv/parse";
import { monthStart, PLANS } from "@/lib/plans";
import { allow, clientIp } from "@/lib/ratelimit";
import { writeDraftCookie, writePrefsCookie } from "@/lib/server/cookies";
import { json, sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

function prefsFrom(form: FormData): CandidatePrefs {
  const country = String(form.get("country") ?? "");
  const city = String(form.get("city") ?? "").replace(/[^\p{L}\p{N} ,.'()]/gu, "").trim().slice(0, 80);
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
    location: city || undefined,
    remoteOnly: form.get("mode") === "remote",
  };
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Request blocked." }, 403);
  if (!allow(`scan:${clientIp(req.headers)}`, 600, 10)) {
    return json({ ok: false, error: "Too many uploads from this connection. Try again in ten minutes." }, 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "The upload was incomplete. Try again." }, 400);
  }
  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) return json({ ok: false, error: "Choose your CV first." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ ok: false, error: "That file is over 4 MB." }, 413);

  let cv;
  try {
    const { text } = await extractText(new Uint8Array(await file.arrayBuffer()));
    cv = parseCv(text);
  } catch (err) {
    if (err instanceof CvError) return json({ ok: false, error: err.message }, 400);
    console.error("scan: extraction failed", err instanceof Error ? err.name : "unknown");
    return json({ ok: false, error: "We could not read that file. Save it as a PDF or Word document and try again." }, 400);
  }

  const prefs = prefsFrom(form);
  const { store, user } = await getBackend();
  if (user) {
    const used = await store.countUsage("scan", monthStart(new Date()));
    if (used >= PLANS[await store.getPlan()].limits.scan) {
      return json({ ok: false, error: "You have used this month's CV scans. Upgrade or wait for next month." }, 402);
    }
    await store.saveProfile(cv, prefs);
    await store.recordUsage("scan");
    return json({ ok: true, next: "/app" });
  }
  const draft = await store.createDraft(cv);
  await writeDraftCookie(draft.id, draft.token);
  await writePrefsCookie(prefs);
  return json({ ok: true, next: "/results" });
}
