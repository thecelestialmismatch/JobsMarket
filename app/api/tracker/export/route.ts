import { getBackend } from "@/lib/backend";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET() {
  const { store, user } = await getBackend();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const rows = await store.listTracker();
  const csv = toCsv(
    ["Company", "Role", "Status", "Date applied", "Follow up", "Contact", "Contact email", "Match score", "Interview", "Offer", "Apply link", "Notes"],
    rows.map((r) => [r.company, r.role, r.status, r.appliedAt, r.followUpAt, r.contactName, r.contactEmail, r.matchScore, r.interviewAt, r.offer, r.applyUrl, r.notes]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="JobsMarket_Tracker.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
