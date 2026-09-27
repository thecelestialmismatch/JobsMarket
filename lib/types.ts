// Shared contracts. Every module builds against these. Change with care.

export type EvidenceId = string; // "E1", "E2", ... assigned by the parser in document order

export type EvidenceSection =
  | "summary"
  | "experience"
  | "project"
  | "education"
  | "certification"
  | "skills"
  | "award"
  | "other";

/** One verbatim line from the candidate's CV. The fact ledger that every generated sentence must trace to. */
export interface Evidence {
  id: EvidenceId;
  section: EvidenceSection;
  text: string;
  employer?: string;
  role?: string;
}

export interface ExperienceEntry {
  title: string;
  employer: string;
  location?: string;
  start?: string; // "YYYY-MM"
  end?: string; // "YYYY-MM" or "present"
  evidenceIds: EvidenceId[];
}

export interface EducationEntry {
  institution: string;
  qualification: string;
  start?: string;
  end?: string;
  evidenceId?: EvidenceId;
}

export interface ProjectEntry {
  title: string;
  evidenceIds: EvidenceId[];
}

export interface ParsedCV {
  contact: { name?: string; email?: string; phone?: string; location?: string; links: string[] };
  summary?: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  certifications: string[];
  /** Canonical skill names (from lib/skills taxonomy) found anywhere in the CV. */
  skills: string[];
  /** Canonical skill name to the evidence lines that mention it. */
  skillEvidence: Record<string, EvidenceId[]>;
  evidence: Evidence[];
  yearsExperience: number | null;
  wordCount: number;
  /** Section heading (normalised lower case) to raw section text, used by the audit. */
  rawSections: Record<string, string>;
  warnings: string[];
}

export type JobSource = "greenhouse" | "lever" | "ashby" | "remotive" | "adzuna" | "manual";
export type RemoteMode = "remote" | "hybrid" | "onsite" | "unknown";
export type JobStatus = "open" | "closed" | "unknown";
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead" | "principal";
export type DegreeLevel = "none" | "bachelor" | "master" | "phd";

export interface EligibilityBar {
  kind: "citizenship" | "permanent_residency" | "work_rights" | "security_clearance" | "license" | "other";
  text: string; // the sentence from the advert that states the bar
}

/** Derived from the advert once at ingest time and stored with the job. */
export interface JobRequirements {
  requiredSkills: string[];
  niceSkills: string[];
  minYears: number | null;
  degree: DegreeLevel | null;
  seniority: Seniority | null;
  eligibility: EligibilityBar[];
  roleFamily: string | null;
}

export interface JobPosting {
  id: string; // `${source}-${board}-${sourceId}` slugified, stable across ingests
  source: JobSource;
  sourceId: string;
  board?: string;
  company: string;
  title: string;
  location: string;
  country?: string; // ISO 3166-1 alpha-2 when inferable
  remote: RemoteMode;
  employmentType?: string;
  description: string; // plain text, never HTML
  url: string;
  applyUrl: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: "year" | "month" | "day" | "hour";
  postedAt?: string; // ISO 8601
  closesAt?: string;
  retrievedAt: string;
  lastCheckedAt: string;
  status: JobStatus;
  skills: string[];
  requirements: JobRequirements;
}

/**
 * The anonymous-safe projection of a job. This is all an unauthenticated visitor's request
 * path may read. No company, description, url or applyUrl. Mirrors the `job_features` view.
 */
export interface JobFeatures {
  id: string;
  title: string;
  location: string;
  country?: string;
  remote: RemoteMode;
  skills: string[];
  requirements: JobRequirements;
  postedAt?: string;
  closesAt?: string;
  status: JobStatus;
}

export interface CandidatePrefs {
  location?: string; // free text, e.g. "Melbourne VIC"
  country?: string; // ISO-2
  remoteOnly?: boolean;
  hasWorkRights?: boolean | null; // null = not stated
}

export type CriterionKey = "skills" | "role" | "experience" | "location" | "education";
export type CriterionStatus = "met" | "partial" | "missing" | "not_applicable";

export interface Criterion {
  key: CriterionKey;
  label: string;
  weight: number; // points available before renormalisation
  earned: number; // points earned before renormalisation
  status: CriterionStatus;
  note: string; // plain sentence, no company name
  evidenceIds: EvidenceId[];
}

export interface Suggestion {
  kind: "add_evidence" | "learn" | "clarify" | "format";
  action: string;
  gain: number; // estimated score points if acted on honestly
}

export type MatchBand = "strong" | "good" | "stretch" | "low";

export interface MatchResult {
  jobId: string;
  score: number; // 0 to 100, integer
  band: MatchBand;
  criteria: Criterion[];
  matchedSkills: string[];
  missingSkills: string[];
  niceMissing: string[];
  eligibility: EligibilityBar[]; // shown to the user, never scored
  timing: { postedDaysAgo: number | null; closesInDays: number | null; label: string };
  explanation: string; // one or two sentences, must not name the company
  suggestions: Suggestion[];
}

/** What an anonymous visitor receives. Built only by lib/gate. */
export interface PreviewMatch {
  locked: true;
  jobId: string;
  title: string;
  location: string;
  remote: RemoteMode;
  score: number;
  band: MatchBand;
  explanation: string;
  matchedCount: number;
  requiredCount: number;
  postedDaysAgo: number | null;
}

/** What a signed-in owner receives. */
export interface FullMatch {
  locked: false;
  job: JobPosting;
  match: MatchResult;
  isNew: boolean;
}

export type DocKind = "cv" | "cover_letter" | "portfolio" | "outreach" | "linkedin" | "interview_prep";

/** Reserved evidence id for a sentence that restates the job advert rather than the candidate. */
export const JOB_EVIDENCE: EvidenceId = "JOB";

export interface DraftSentence {
  text: string;
  /** CV evidence ids backing the sentence, or JOB_EVIDENCE. Empty only for structural lines (name, contact, sign off). */
  evidenceIds: EvidenceId[];
}

export interface DraftSection {
  heading: string;
  style: "paragraph" | "bullets" | "lines";
  items: DraftSentence[];
  /** Optional sub-heading lines for experience blocks, e.g. role and dates. */
  meta?: string;
}

export interface DraftDocument {
  kind: DocKind;
  title: string;
  sections: DraftSection[];
}

export interface LintIssue {
  rule: string;
  message: string;
  excerpt: string;
  severity: "error" | "warning";
  doc?: DocKind;
}

export interface FactIssue {
  sentence: string;
  problem: string;
  doc?: DocKind;
}

export interface GeneratedKit {
  id: string;
  jobId: string;
  documents: DraftDocument[];
  lint: LintIssue[];
  facts: FactIssue[];
  generator: "claude" | "deterministic";
  portfolioIncluded: boolean;
  portfolioReason: string;
  createdAt: string;
  status: "draft" | "approved";
}

export interface TitleFit {
  title: string;
  roleFamily: string;
  score: number; // 0 to 100
  atsKeywords: string[];
  haveKeywords: string[];
  missingKeywords: string[];
  openJobs: number;
}

export interface AuditFlag {
  key: string;
  label: string;
  severity: "high" | "medium" | "low";
  detail: string;
  fix: string;
}

export interface BulletCoach {
  evidenceId: EvidenceId;
  original: string;
  issues: string[];
  /** Accomplished [X] as measured by [Y], by doing [Z]. Unknown numbers stay as [add figure]. */
  xyzTemplate: string;
}

export interface ResumeAudit {
  score: number; // 1 to 10
  flags: AuditFlag[];
  toTen: string[];
  bulletCoach: BulletCoach[];
  stats: { bullets: number; bulletsWithMetrics: number; wordCount: number; estPages: number };
}

export interface MarketScan {
  totalOpen: number;
  skillDemand: { skill: string; count: number; share: number; youHave: boolean }[];
  salaryBands: { roleFamily: string; min: number; median: number; max: number; currency: string; n: number }[];
  eligibilityShare: number; // share of open jobs with at least one eligibility bar
  sources: { source: JobSource; count: number }[];
}

export interface SkillGap {
  skill: string;
  demandShare: number; // share of target jobs that ask for it
  scoreGain: number; // average points gained across target jobs if evidenced
  learn: string; // one honest, specific next step
}

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "no_response"
  | "withdrawn";

export interface TrackerRow {
  id: string;
  jobId?: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt?: string; // YYYY-MM-DD
  followUpAt?: string;
  contactName?: string;
  contactEmail?: string;
  matchScore?: number;
  notes?: string;
  interviewAt?: string;
  offer?: string;
  applyUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanId = "free" | "pro";
export type UsageKind = "kit" | "scan";

export interface SessionUser {
  id: string;
  email: string;
}
