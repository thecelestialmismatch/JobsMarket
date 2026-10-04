import type { CriterionStatus, MatchBand } from "@/lib/types";

/** Citation chip. Ids are CV evidence line numbers, or "JOB" when a sentence restates the advert. */
export function EvidenceTag({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  const label = ids.includes("JOB") ? "advert" : ids.slice(0, 3).join(" ");
  return (
    <sup className="etag" title={ids.includes("JOB") ? "Restates the job advert" : `From your CV, line ${ids.join(", ")}`}>
      {label}
    </sup>
  );
}

/** Solid bar standing in for text the viewer is not allowed to see. Width is fixed, not derived from the hidden text. */
export function Redacted({ w = "7em", label }: { w?: string; label: string }) {
  return <span className="redact" style={{ width: w }} role="img" aria-label={`${label} hidden until you sign in`} />;
}

const BAND_CLASS: Record<MatchBand, string> = {
  strong: "hl-match",
  good: "hl-match",
  stretch: "hl-unknown",
  low: "hl-gap",
};
const BAND_LABEL: Record<MatchBand, string> = { strong: "Strong fit", good: "Good fit", stretch: "Stretch", low: "Low fit" };

export function ScoreMark({ score, band, size = "md" }: { score: number; band: MatchBand; size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`score ${size === "lg" ? "text-4xl" : "text-xl"}`}>
        <span className={`hl ${BAND_CLASS[band]}`}>{score}</span>
      </span>
      <span className="label">{BAND_LABEL[band]}</span>
    </span>
  );
}

const STATUS_CLASS: Record<CriterionStatus, string> = {
  met: "hl-match",
  partial: "hl-unknown",
  missing: "hl-gap",
  not_applicable: "",
};
const STATUS_LABEL: Record<CriterionStatus, string> = {
  met: "Evidence found",
  partial: "Partly evidenced",
  missing: "No evidence",
  not_applicable: "Not asked",
};

export function StatusMark({ status }: { status: CriterionStatus }) {
  return <span className={`label hl ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}
