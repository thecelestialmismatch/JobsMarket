import { getAdminStore } from "@/lib/backend";
import { BOARDS } from "@/lib/jobs/boards";
import { ingestAll } from "@/lib/jobs/ingest";
import { reconcile } from "@/lib/jobs/liveness";
import { analyzeJob } from "@/lib/match";
import { json } from "@/lib/server/http";
import { secretMatches } from "@/lib/server/secret";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET". Refreshes postings from the
// configured boards and closes roles that have disappeared from boards that answered.
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(token, process.env.CRON_SECRET)) return json({ ok: false, error: "Unauthorised" }, 401);

  const admin = getAdminStore();
  if (!admin) return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, 503);

  const now = new Date();
  const adzuna =
    process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
      ? {
          appId: process.env.ADZUNA_APP_ID,
          appKey: process.env.ADZUNA_APP_KEY,
          country: process.env.ADZUNA_COUNTRY ?? "au",
          queries: (process.env.ADZUNA_QUERIES ?? "data analyst,software engineer,cloud engineer,customer service").split(","),
        }
      : undefined;

  const fresh = await ingestAll(BOARDS, { fetch, now, analyze: analyzeJob, adzuna });
  const existing = await admin.allJobs();
  const { upserts, closedIds } = reconcile(existing, fresh.jobs, fresh.okBoards, now);
  await admin.upsertJobs(upserts);
  await admin.closeJobs(closedIds, now.toISOString());

  return json({
    ok: true,
    fetched: fresh.jobs.length,
    upserted: upserts.length,
    closed: closedIds.length,
    boardsOk: fresh.okBoards.length,
    errors: fresh.errors,
  });
}
