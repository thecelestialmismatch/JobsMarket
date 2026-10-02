import type { JobPosting, JobSource } from "@/lib/types";

const SOURCE: Record<JobSource, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  remotive: "Remotive",
  adzuna: "Adzuna",
  linkedin: "LinkedIn",
  manual: "Demo data",
};

export function sourceLabel(s: JobSource): string {
  return SOURCE[s];
}

export function ago(iso: string | undefined, now = new Date()): string {
  if (!iso) return "date not stated";
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function salaryLabel(j: Pick<JobPosting, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">): string | null {
  if (!j.salaryMin && !j.salaryMax) return null;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = j.salaryMin && j.salaryMax ? `${fmt(j.salaryMin)} to ${fmt(j.salaryMax)}` : fmt((j.salaryMin ?? j.salaryMax)!);
  return `${j.salaryCurrency ?? ""} ${range}${j.salaryPeriod && j.salaryPeriod !== "year" ? ` per ${j.salaryPeriod}` : ""}`.trim();
}

export const REMOTE_LABEL: Record<JobPosting["remote"], string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  unknown: "Arrangement not stated",
};
