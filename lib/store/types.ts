import type {
  CandidatePrefs,
  GeneratedKit,
  JobFeatures,
  JobPosting,
  ParsedCV,
  PlanId,
  PortfolioPage,
  TrackerRow,
  UsageKind,
} from "@/lib/types";

export interface Profile {
  cv: ParsedCV;
  prefs: CandidatePrefs;
  lastSeenAt: string | null;
  updatedAt: string;
}

/**
 * Request scoped data access, bound to the current viewer. Every method that touches private
 * data is enforced by the backend (Postgres RLS in production), not only by the caller.
 */
export interface Store {
  /** Anonymous safe projection of open jobs. */
  listJobFeatures(): Promise<JobFeatures[]>;
  /** Full open postings. Signed in viewers only, throws otherwise. */
  listJobs(): Promise<JobPosting[]>;
  getJob(id: string): Promise<JobPosting | null>;

  /** Anonymous upload. Returns a capability token that is the only way to read the draft back. */
  createDraft(cv: ParsedCV): Promise<{ id: string; token: string }>;
  getDraft(id: string, token: string): Promise<ParsedCV | null>;
  /** Binds the draft to the signed in viewer as their profile. */
  claimDraft(id: string, token: string): Promise<boolean>;

  getProfile(): Promise<Profile | null>;
  saveProfile(cv: ParsedCV, prefs: CandidatePrefs): Promise<void>;
  markSeen(at: string): Promise<void>;

  listKits(): Promise<GeneratedKit[]>;
  getKit(id: string): Promise<GeneratedKit | null>;
  saveKit(kit: GeneratedKit): Promise<void>;
  setKitStatus(id: string, status: GeneratedKit["status"]): Promise<void>;

  listTracker(): Promise<TrackerRow[]>;
  saveTracker(row: TrackerRow): Promise<void>;
  deleteTracker(id: string): Promise<void>;

  /** Append only usage ledger. Deleting kits never refunds quota. */
  recordUsage(kind: UsageKind): Promise<void>;
  countUsage(kind: UsageKind, sinceIso: string): Promise<number>;
  getPlan(): Promise<PlanId>;

  listPortfolios(): Promise<PortfolioPage[]>;
  savePortfolio(page: PortfolioPage): Promise<void>;
  deletePortfolio(id: string): Promise<void>;
  /** Public read of a published page. Works for anonymous viewers. */
  getPublishedPortfolio(slug: string): Promise<PortfolioPage | null>;

  deleteMyData(): Promise<void>;

  /**
   * Per signed in user limit for a named bucket (lower case letters and underscores). True when
   * allowed. Anonymous callers always get false, use lib/ratelimit for per IP limits.
   */
  rateLimit(bucket: string, windowSec: number, max: number): Promise<boolean>;
}

/** Service role operations for the ingestion cron and the billing webhook. Never reachable from a browser. */
export interface AdminStore {
  allJobs(): Promise<JobPosting[]>;
  upsertJobs(jobs: JobPosting[]): Promise<void>;
  closeJobs(ids: string[], at: string): Promise<void>;
  setPlan(
    userId: string,
    plan: PlanId,
    billing: { customerId?: string; subscriptionId?: string; status: string; periodEnd?: string },
  ): Promise<void>;
  userIdForCustomer(customerId: string): Promise<string | null>;
}

export class NotSignedInError extends Error {
  constructor() {
    super("Sign in to see this.");
    this.name = "NotSignedInError";
  }
}
