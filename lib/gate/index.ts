import type { FullMatch, JobFeatures, JobPosting, MatchResult, PreviewMatch } from "@/lib/types";

// The only place anonymous DTOs are built. Fields are copied one by one from an allowlist so a
// new column on JobFeatures or MatchResult can never reach an anonymous visitor by accident.
export function toPreview(job: JobFeatures, match: MatchResult): PreviewMatch {
  const required = job.requirements.requiredSkills.length;
  return {
    locked: true,
    jobId: job.id,
    title: job.title,
    location: job.location,
    remote: job.remote,
    score: match.score,
    band: match.band,
    explanation: match.explanation,
    matchedCount: required - match.missingSkills.length,
    requiredCount: required,
    postedDaysAgo: match.timing.postedDaysAgo,
  };
}

export function toFull(job: JobPosting, match: MatchResult, lastSeenAt: string | null): FullMatch {
  const firstSeen = job.retrievedAt;
  return { locked: false, job, match, isNew: lastSeenAt !== null && firstSeen > lastSeenAt };
}
