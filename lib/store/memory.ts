import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
import { NotSignedInError, type AdminStore, type Profile, type Store } from "./types";

// In-process backend for tests, local demos and self-hosted evaluation. Refused on Vercel
// (see lib/backend.ts). Data lives until the process exits.

interface Draft {
  tokenHash: Buffer;
  cv: ParsedCV;
  createdAt: number;
  claimedBy: string | null;
}

export interface MemoryDb {
  jobs: Map<string, JobPosting>;
  drafts: Map<string, Draft>;
  profiles: Map<string, Profile>;
  kits: Map<string, GeneratedKit & { owner: string }>;
  tracker: Map<string, TrackerRow & { owner: string }>;
  usage: { owner: string; kind: UsageKind; at: string }[];
  plans: Map<string, { plan: PlanId; customerId?: string }>;
  portfolios: Map<string, PortfolioPage & { owner: string }>;
  hits: Map<string, number[]>;
}

export function createMemoryDb(jobs: JobPosting[] = []): MemoryDb {
  return {
    jobs: new Map(jobs.map((j) => [j.id, j])),
    drafts: new Map(),
    profiles: new Map(),
    kits: new Map(),
    tracker: new Map(),
    usage: [],
    plans: new Map(),
    portfolios: new Map(),
    hits: new Map(),
  };
}

const DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function toFeatures(j: JobPosting): JobFeatures {
  return {
    id: j.id,
    title: j.title,
    location: j.location,
    country: j.country,
    remote: j.remote,
    skills: j.skills,
    requirements: j.requirements,
    postedAt: j.postedAt,
    closesAt: j.closesAt,
    status: j.status,
  };
}

export class MemoryStore implements Store {
  constructor(
    private readonly db: MemoryDb,
    private readonly userId: string | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private me(): string {
    if (!this.userId) throw new NotSignedInError();
    return this.userId;
  }

  private openJobs(): JobPosting[] {
    return [...this.db.jobs.values()].filter((j) => j.status === "open");
  }

  async listJobFeatures() {
    return this.openJobs().map(toFeatures);
  }

  async listJobs() {
    this.me();
    return this.openJobs();
  }

  async getJob(id: string) {
    this.me();
    return this.db.jobs.get(id) ?? null;
  }

  async createDraft(cv: ParsedCV) {
    const id = randomUUID();
    const token = randomBytes(24).toString("base64url");
    this.db.drafts.set(id, { tokenHash: sha256(token), cv, createdAt: this.now().getTime(), claimedBy: null });
    return { id, token };
  }

  private draft(id: string, token: string): Draft | null {
    const d = this.db.drafts.get(id);
    if (!d || this.now().getTime() - d.createdAt > DRAFT_TTL_MS) return null;
    return timingSafeEqual(d.tokenHash, sha256(token)) ? d : null;
  }

  async getDraft(id: string, token: string) {
    const d = this.draft(id, token);
    return d && !d.claimedBy ? d.cv : null;
  }

  async claimDraft(id: string, token: string) {
    const owner = this.me();
    const d = this.draft(id, token);
    if (!d || (d.claimedBy && d.claimedBy !== owner)) return false;
    this.db.drafts.set(id, { ...d, claimedBy: owner });
    const existing = this.db.profiles.get(owner);
    await this.saveProfile(d.cv, existing?.prefs ?? {});
    return true;
  }

  async getProfile() {
    return this.db.profiles.get(this.me()) ?? null;
  }

  async saveProfile(cv: ParsedCV, prefs: CandidatePrefs) {
    const owner = this.me();
    const prev = this.db.profiles.get(owner);
    this.db.profiles.set(owner, { cv, prefs, lastSeenAt: prev?.lastSeenAt ?? null, updatedAt: this.now().toISOString() });
  }

  async markSeen(at: string) {
    const owner = this.me();
    const prev = this.db.profiles.get(owner);
    if (prev) this.db.profiles.set(owner, { ...prev, lastSeenAt: at });
  }

  async listKits() {
    const owner = this.me();
    return [...this.db.kits.values()]
      .filter((k) => k.owner === owner)
      .map(({ owner: _o, ...k }) => k)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getKit(id: string) {
    const k = this.db.kits.get(id);
    if (!k || k.owner !== this.me()) return null;
    const { owner: _o, ...kit } = k;
    return kit;
  }

  async saveKit(kit: GeneratedKit) {
    const owner = this.me();
    const prev = this.db.kits.get(kit.id);
    if (prev && prev.owner !== owner) throw new NotSignedInError();
    this.db.kits.set(kit.id, { ...kit, owner });
  }

  async setKitStatus(id: string, status: GeneratedKit["status"]) {
    const k = this.db.kits.get(id);
    if (k && k.owner === this.me()) this.db.kits.set(id, { ...k, status });
  }

  async listTracker() {
    const owner = this.me();
    return [...this.db.tracker.values()]
      .filter((r) => r.owner === owner)
      .map(({ owner: _o, ...r }) => r)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveTracker(row: TrackerRow) {
    const owner = this.me();
    const prev = this.db.tracker.get(row.id);
    if (prev && prev.owner !== owner) throw new NotSignedInError();
    this.db.tracker.set(row.id, { ...row, owner });
  }

  async deleteTracker(id: string) {
    const r = this.db.tracker.get(id);
    if (r && r.owner === this.me()) this.db.tracker.delete(id);
  }

  async recordUsage(kind: UsageKind) {
    this.db.usage.push({ owner: this.me(), kind, at: this.now().toISOString() });
  }

  async countUsage(kind: UsageKind, sinceIso: string) {
    const owner = this.me();
    return this.db.usage.filter((u) => u.owner === owner && u.kind === kind && u.at >= sinceIso).length;
  }

  async getPlan(): Promise<PlanId> {
    return this.db.plans.get(this.me())?.plan ?? "free";
  }

  async listPortfolios() {
    const owner = this.me();
    return [...this.db.portfolios.values()].filter((p) => p.owner === owner).map(({ owner: _o, ...p }) => p);
  }

  async savePortfolio(page: PortfolioPage) {
    const owner = this.me();
    const prev = this.db.portfolios.get(page.id);
    const slugTaken = [...this.db.portfolios.values()].some((p) => p.slug === page.slug && p.id !== page.id);
    if ((prev && prev.owner !== owner) || slugTaken) throw new NotSignedInError();
    this.db.portfolios.set(page.id, { ...page, owner });
  }

  async deletePortfolio(id: string) {
    const p = this.db.portfolios.get(id);
    if (p && p.owner === this.me()) this.db.portfolios.delete(id);
  }

  async getPublishedPortfolio(slug: string) {
    const p = [...this.db.portfolios.values()].find((x) => x.slug === slug && x.published);
    if (!p) return null;
    const { owner: _o, ...page } = p;
    return page;
  }

  async deleteMyData() {
    const owner = this.me();
    for (const [id, p] of this.db.portfolios) if (p.owner === owner) this.db.portfolios.delete(id);
    this.db.profiles.delete(owner);
    for (const [id, k] of this.db.kits) if (k.owner === owner) this.db.kits.delete(id);
    for (const [id, r] of this.db.tracker) if (r.owner === owner) this.db.tracker.delete(id);
    for (const [id, d] of this.db.drafts) if (d.claimedBy === owner) this.db.drafts.delete(id);
  }

  async rateLimit(bucket: string, windowSec: number, max: number) {
    if (!this.userId) return false;
    const key = `${bucket}:${this.userId}`;
    const t = this.now().getTime();
    const recent = (this.db.hits.get(key) ?? []).filter((x) => t - x < windowSec * 1000);
    if (recent.length >= max) return false;
    this.db.hits.set(key, [...recent, t]);
    return true;
  }
}

export class MemoryAdminStore implements AdminStore {
  constructor(private readonly db: MemoryDb) {}

  async allJobs() {
    return [...this.db.jobs.values()];
  }

  async upsertJobs(jobs: JobPosting[]) {
    for (const j of jobs) this.db.jobs.set(j.id, j);
  }

  async closeJobs(ids: string[], at: string) {
    for (const id of ids) {
      const j = this.db.jobs.get(id);
      if (j) this.db.jobs.set(id, { ...j, status: "closed", lastCheckedAt: at });
    }
  }

  async setPlan(userId: string, plan: PlanId, billing: { customerId?: string; status: string }) {
    this.db.plans.set(userId, { plan, customerId: billing.customerId });
  }

  async userIdForCustomer(customerId: string) {
    for (const [userId, p] of this.db.plans) if (p.customerId === customerId) return userId;
    return null;
  }
}
