import { z } from "zod";
import type { ApplicationStatus, TrackerRow } from "@/lib/types";

export const STATUSES: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "rejected", "no_response", "withdrawn"];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  no_response: "No response",
  withdrawn: "Withdrawn",
};

/** Green for progress, yellow for waiting, pink for a closed door. */
export const STATUS_TONE: Record<ApplicationStatus, "match" | "unknown" | "gap" | ""> = {
  saved: "",
  applied: "unknown",
  interview: "match",
  offer: "match",
  rejected: "gap",
  no_response: "gap",
  withdrawn: "",
};

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional();
const text = (max: number) => z.string().trim().max(max).optional();

export const TrackerInput = z.object({
  id: z.string().uuid().optional(),
  company: z.string().trim().min(1, "Add the employer.").max(120),
  role: z.string().trim().min(1, "Add the role.").max(160),
  status: z.enum(STATUSES as [ApplicationStatus, ...ApplicationStatus[]]),
  appliedAt: date,
  followUpAt: date,
  interviewAt: date,
  contactName: text(120),
  contactEmail: z.union([z.literal(""), z.string().trim().email().max(254)]).optional(),
  notes: text(2000),
  offer: text(200),
  applyUrl: z.union([z.literal(""), z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), "Use a web link.")]).optional(),
});

export interface TrackerStats {
  total: number;
  applied: number;
  responseRate: number; // share of sent applications that got any answer
  interviewRate: number; // share of sent applications that reached interview or offer
}

export function trackerStats(rows: TrackerRow[]): TrackerStats {
  const sent = rows.filter((r) => r.status !== "saved" && r.status !== "withdrawn");
  const answered = sent.filter((r) => ["interview", "offer", "rejected"].includes(r.status));
  const interviews = sent.filter((r) => r.status === "interview" || r.status === "offer");
  const share = (n: number) => (sent.length ? Math.round((n / sent.length) * 100) : 0);
  return { total: rows.length, applied: sent.length, responseRate: share(answered.length), interviewRate: share(interviews.length) };
}

/** Follow up is due when the date has passed and the application is still waiting. */
export function followUpDue(r: TrackerRow, today: string): boolean {
  return Boolean(r.followUpAt && r.followUpAt <= today && (r.status === "applied" || r.status === "no_response"));
}
