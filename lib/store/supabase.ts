import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CandidatePrefs,
  GeneratedKit,
  JobFeatures,
  JobPosting,
  ParsedCV,
  PlanId,
  PortfolioPage,
  SessionUser,
  TrackerRow,
  UsageKind,
} from "@/lib/types";
import { NotSignedInError, type AdminStore, type Profile, type Store } from "./types";

// Every query below runs as the viewer (publishable key plus session cookie). Postgres RLS and
// column grants in supabase/migrations decide what comes back, this file only maps shapes.

const FEATURE_COLUMNS = "id,title,location,country,remote,skills,requirements,posted_at,closes_at,status";
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Database ${what} failed${error ? ` (${error.message})` : ""}`);
}

export function rowToJob(r: Row): JobPosting {
  const opt = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));
  return {
    id: r.id as string,
    source: r.source as JobPosting["source"],
    sourceId: r.source_id as string,
    board: opt(r.board),
    company: r.company as string,
    title: r.title as string,
    location: (r.location as string) ?? "",
    country: opt(r.country),
    remote: r.remote as JobPosting["remote"],
    employmentType: opt(r.employment_type),
    description: (r.description as string) ?? "",
    url: r.url as string,
    applyUrl: r.apply_url as string,
    salaryMin: opt<number>(r.salary_min) !== undefined ? Number(r.salary_min) : undefined,
    salaryMax: opt<number>(r.salary_max) !== undefined ? Number(r.salary_max) : undefined,
    salaryCurrency: opt(r.salary_currency),
    salaryPeriod: opt(r.salary_period),
    postedAt: opt(r.posted_at),
    closesAt: opt(r.closes_at),
    retrievedAt: r.retrieved_at as string,
    lastCheckedAt: r.last_checked_at as string,
    status: r.status as JobPosting["status"],
    skills: (r.skills as string[]) ?? [],
    requirements: r.requirements as JobPosting["requirements"],
  };
}

export function jobToRow(j: JobPosting): Row {
  return {
    id: j.id,
    source: j.source,
    source_id: j.sourceId,
    board: j.board ?? null,
    company: j.company,
    title: j.title,
    location: j.location,
    country: j.country ?? null,
    remote: j.remote,
    employment_type: j.employmentType ?? null,
    description: j.description,
    url: j.url,
    apply_url: j.applyUrl,
    salary_min: j.salaryMin ?? null,
    salary_max: j.salaryMax ?? null,
    salary_currency: j.salaryCurrency ?? null,
    salary_period: j.salaryPeriod ?? null,
    posted_at: j.postedAt ?? null,
    closes_at: j.closesAt ?? null,
    retrieved_at: j.retrievedAt,
    last_checked_at: j.lastCheckedAt,
    status: j.status,
    skills: j.skills,
    requirements: j.requirements,
  };
}

function rowToFeatures(r: Row): JobFeatures {
  return {
    id: r.id as string,
    title: r.title as string,
    location: (r.location as string) ?? "",
    country: (r.country as string | null) ?? undefined,
    remote: r.remote as JobFeatures["remote"],
    skills: (r.skills as string[]) ?? [],
    requirements: r.requirements as JobFeatures["requirements"],
    postedAt: (r.posted_at as string | null) ?? undefined,
    closesAt: (r.closes_at as string | null) ?? undefined,
    status: r.status as JobFeatures["status"],
  };
}

async function pageAll(fetchPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) fail("read", error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export class SupabaseStore implements Store {
  constructor(
    private readonly db: SupabaseClient,
    private readonly user: SessionUser | null,
  ) {}

  private me(): string {
    if (!this.user) throw new NotSignedInError();
    return this.user.id;
  }

  async listJobFeatures() {
    const rows = await pageAll((a, b) =>
      this.db.from("job_postings").select(FEATURE_COLUMNS).eq("status", "open").order("id").range(a, b),
    );
    return rows.map(rowToFeatures);
  }

  async listJobs() {
    this.me();
    const rows = await pageAll((a, b) => this.db.from("job_postings").select("*").eq("status", "open").order("id").range(a, b));
    return rows.map(rowToJob);
  }

  async getJob(id: string) {
    this.me();
    const { data, error } = await this.db.from("job_postings").select("*").eq("id", id).maybeSingle();
    if (error) fail("job read", error);
    return data ? rowToJob(data) : null;
  }

  async createDraft(cv: ParsedCV) {
    const { data, error } = await this.db.rpc("create_draft", { p_cv: cv });
    if (error || !Array.isArray(data) || !data[0]) fail("draft save", error);
    return { id: data[0].id as string, token: data[0].token as string };
  }

  async getDraft(id: string, token: string) {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db.rpc("get_draft", { p_id: id, p_token: token });
    if (error) fail("draft read", error);
    return (data as ParsedCV | null) ?? null;
  }

  async claimDraft(id: string, token: string) {
    this.me();
    if (!UUID.test(id)) return false;
    const { data, error } = await this.db.rpc("claim_draft", { p_id: id, p_token: token });
    if (error) fail("draft claim", error);
    return data === true;
  }

  async getProfile(): Promise<Profile | null> {
    const uid = this.me();
    const { data, error } = await this.db.from("candidate_profiles").select("*").eq("user_id", uid).maybeSingle();
    if (error) fail("profile read", error);
    if (!data) return null;
    return { cv: data.cv, prefs: data.prefs ?? {}, lastSeenAt: data.last_seen_at, updatedAt: data.updated_at };
  }

  async saveProfile(cv: ParsedCV, prefs: CandidatePrefs) {
    const uid = this.me();
    const { error } = await this.db
      .from("candidate_profiles")
      .upsert({ user_id: uid, cv, prefs, updated_at: new Date().toISOString() });
    if (error) fail("profile save", error);
  }

  async markSeen(at: string) {
    const uid = this.me();
    const { error } = await this.db.from("candidate_profiles").update({ last_seen_at: at }).eq("user_id", uid);
    if (error) fail("profile update", error);
  }

  async listKits() {
    const uid = this.me();
    const { data, error } = await this.db
      .from("kits")
      .select("data,status")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) fail("kit list", error);
    return (data ?? []).map((r) => ({ ...(r.data as GeneratedKit), status: r.status }));
  }

  async getKit(id: string) {
    const uid = this.me();
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db.from("kits").select("data,status").eq("id", id).eq("user_id", uid).maybeSingle();
    if (error) fail("kit read", error);
    return data ? { ...(data.data as GeneratedKit), status: data.status } : null;
  }

  async saveKit(kit: GeneratedKit) {
    const uid = this.me();
    const { error } = await this.db
      .from("kits")
      .upsert({ id: kit.id, user_id: uid, job_id: kit.jobId, status: kit.status, data: kit, created_at: kit.createdAt });
    if (error) fail("kit save", error);
  }

  async setKitStatus(id: string, status: GeneratedKit["status"]) {
    const uid = this.me();
    const { error } = await this.db.from("kits").update({ status }).eq("id", id).eq("user_id", uid);
    if (error) fail("kit update", error);
  }

  async listTracker() {
    const uid = this.me();
    const { data, error } = await this.db
      .from("tracker")
      .select("data")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) fail("tracker list", error);
    return (data ?? []).map((r) => r.data as TrackerRow);
  }

  async saveTracker(row: TrackerRow) {
    const uid = this.me();
    const { error } = await this.db.from("tracker").upsert({ id: row.id, user_id: uid, data: row, updated_at: row.updatedAt });
    if (error) fail("tracker save", error);
  }

  async deleteTracker(id: string) {
    const uid = this.me();
    const { error } = await this.db.from("tracker").delete().eq("id", id).eq("user_id", uid);
    if (error) fail("tracker delete", error);
  }

  async recordUsage(kind: UsageKind) {
    const uid = this.me();
    const { error } = await this.db.from("usage").insert({ user_id: uid, kind });
    if (error) fail("usage write", error);
  }

  async countUsage(kind: UsageKind, sinceIso: string) {
    const uid = this.me();
    const { count, error } = await this.db
      .from("usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("kind", kind)
      .gte("at", sinceIso);
    if (error) fail("usage read", error);
    return count ?? 0;
  }

  async getPlan(): Promise<PlanId> {
    const uid = this.me();
    const { data, error } = await this.db.from("subscriptions").select("plan,status").eq("user_id", uid).maybeSingle();
    if (error) fail("plan read", error);
    return data?.plan === "pro" && ["active", "trialing"].includes(data.status) ? "pro" : "free";
  }

  async listPortfolios() {
    const uid = this.me();
    const { data, error } = await this.db.from("portfolio_pages").select("data,published").eq("user_id", uid);
    if (error) fail("portfolio list", error);
    return (data ?? []).map((r) => ({ ...(r.data as PortfolioPage), published: r.published }));
  }

  async savePortfolio(page: PortfolioPage) {
    const uid = this.me();
    const { error } = await this.db.from("portfolio_pages").upsert({
      id: page.id,
      user_id: uid,
      slug: page.slug,
      role_family: page.roleFamily,
      data: page,
      published: page.published,
      updated_at: page.updatedAt,
    });
    if (error) fail("portfolio save", error);
  }

  async deletePortfolio(id: string) {
    const uid = this.me();
    const { error } = await this.db.from("portfolio_pages").delete().eq("id", id).eq("user_id", uid);
    if (error) fail("portfolio delete", error);
  }

  async getPublishedPortfolio(slug: string) {
    if (!/^[a-z0-9-]{6,64}$/.test(slug)) return null;
    const { data, error } = await this.db
      .from("portfolio_pages")
      .select("data,published")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    if (error) fail("portfolio read", error);
    return data ? { ...(data.data as PortfolioPage), published: true } : null;
  }

  async deleteMyData() {
    const uid = this.me();
    for (const table of ["kits", "tracker", "portfolio_pages", "candidate_profiles"]) {
      const { error } = await this.db.from(table).delete().eq("user_id", uid);
      if (error) fail(`${table} delete`, error);
    }
  }

  async rateLimit(bucket: string, windowSec: number, max: number) {
    if (!this.user) return false;
    const { data, error } = await this.db.rpc("hit_rate_limit", { p_bucket: bucket, p_window_sec: windowSec, p_max: max });
    if (error) fail("rate limit", error);
    return data === true;
  }
}

export class SupabaseAdminStore implements AdminStore {
  constructor(private readonly db: SupabaseClient) {}

  async allJobs() {
    const rows = await pageAll((a, b) => this.db.from("job_postings").select("*").order("id").range(a, b));
    return rows.map(rowToJob);
  }

  async upsertJobs(jobs: JobPosting[]) {
    for (let i = 0; i < jobs.length; i += 200) {
      const { error } = await this.db.from("job_postings").upsert(jobs.slice(i, i + 200).map(jobToRow));
      if (error) fail("job upsert", error);
    }
  }

  async closeJobs(ids: string[], at: string) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await this.db
        .from("job_postings")
        .update({ status: "closed", last_checked_at: at })
        .in("id", ids.slice(i, i + 200));
      if (error) fail("job close", error);
    }
  }

  async setPlan(
    userId: string,
    plan: PlanId,
    billing: { customerId?: string; subscriptionId?: string; status: string; periodEnd?: string },
  ) {
    const { error } = await this.db.from("subscriptions").upsert({
      user_id: userId,
      plan,
      status: billing.status,
      customer_id: billing.customerId ?? null,
      subscription_id: billing.subscriptionId ?? null,
      period_end: billing.periodEnd ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) fail("plan write", error);
  }

  async userIdForCustomer(customerId: string) {
    const { data, error } = await this.db.from("subscriptions").select("user_id").eq("customer_id", customerId).maybeSingle();
    if (error) fail("customer lookup", error);
    return (data?.user_id as string | undefined) ?? null;
  }
}
