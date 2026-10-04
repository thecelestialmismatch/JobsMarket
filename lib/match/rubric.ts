import type { Criterion, CriterionKey, EvidenceId } from "@/lib/types";

/** Points available per criterion before renormalisation. Shown to users as the rubric. */
export const RUBRIC: Readonly<Record<CriterionKey, number>> = Object.freeze({
  skills: 50,
  role: 20,
  experience: 15,
  location: 10,
  education: 5,
});

export const LABELS: Readonly<Record<CriterionKey, string>> = Object.freeze({
  skills: "Skills",
  role: "Role fit",
  experience: "Experience",
  location: "Location",
  education: "Education",
});

export function criterion(
  key: CriterionKey,
  status: Criterion["status"],
  share: number,
  note: string,
  evidenceIds: EvidenceId[] = [],
): Criterion {
  const weight = RUBRIC[key];
  const earned = status === "not_applicable" ? 0 : Math.round(weight * share * 100) / 100;
  return { key, label: LABELS[key], weight, earned, status, note, evidenceIds };
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
