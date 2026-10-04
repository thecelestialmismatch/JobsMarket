import { getAdminStore } from "@/lib/backend";
import { reconcile } from "@/lib/jobs/liveness";
import { normalizeJob } from "@/lib/jobs/normalize";
import { parseLinkedInJobs } from "@/lib/jobs/sources/linkedin";
import { SourceError } from "@/lib/jobs/sources/common";
import { analyzeJob } from "@/lib/match";
import { json } from "@/lib/server/http";
import { secretMatches } from "@/lib/server/secret";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_000_000;

// Takes the JSON printed by sidecar/linkedin/scrape.py. Same bearer secret as the ingest cron.
// LinkedIn rows are never closed by absence (PARTIAL_SOURCES), they expire 30 days after their last import.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(token, process.env.CRON_SECRET)) return json({ ok: false, error: "Unauthorised" }, 401);
  const admin = getAdminStore();
  if (!admin) return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, 503);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: "Body is too large." }, 413);
  try {
    const now = new Date();
    const jobs = parseLinkedInJobs(JSON.parse(text), now).map((raw) => normalizeJob(raw, { now, analyze: analyzeJob }));
    // reconcile keeps each row's first seen date, so a re-import does not make old jobs look new again.
    const { upserts, closedIds } = reconcile(await admin.allJobs(), jobs, [], now);
    await admin.upsertJobs(upserts);
    await admin.closeJobs(closedIds, now.toISOString());
    return json({ ok: true, imported: upserts.length });
  } catch (err) {
    if (err instanceof SourceError || err instanceof SyntaxError) return json({ ok: false, error: err.message }, 400);
    console.error("linkedin import: failed", err instanceof Error ? err.name : "unknown");
    return json({ ok: false, error: "Import failed." }, 500);
  }
}
