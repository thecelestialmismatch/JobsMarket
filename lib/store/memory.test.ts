import { describe, expect, it } from "vitest";
import type { JobPosting, ParsedCV } from "@/lib/types";
import { createMemoryDb, MemoryAdminStore, MemoryStore } from "./memory";
import { NotSignedInError } from "./types";

const cv = { evidence: [], skills: [], skillEvidence: {} } as unknown as ParsedCV;
const job = {
  id: "j1",
  company: "Quillfeather Analytics",
  url: "https://jobs.example.test/1",
  status: "open",
  title: "Analyst",
  requirements: { requiredSkills: [] },
} as unknown as JobPosting;

describe("MemoryStore", () => {
  it("anonymous viewers see features only and cannot read full jobs", async () => {
    const anon = new MemoryStore(createMemoryDb([job]), null);
    const feats = await anon.listJobFeatures();
    expect(JSON.stringify(feats)).not.toContain("Quillfeather");
    expect(JSON.stringify(feats)).not.toContain("example.test");
    await expect(anon.listJobs()).rejects.toBeInstanceOf(NotSignedInError);
    await expect(anon.getJob("j1")).rejects.toBeInstanceOf(NotSignedInError);
  });

  it("drafts need the exact token and are claimed once", async () => {
    const db = createMemoryDb();
    const anon = new MemoryStore(db, null);
    const { id, token } = await anon.createDraft(cv);
    expect(await anon.getDraft(id, "wrong")).toBeNull();
    expect(await anon.getDraft(id, token)).toBe(cv);
    expect(await new MemoryStore(db, "u1").claimDraft(id, token)).toBe(true);
    expect(await new MemoryStore(db, "u2").claimDraft(id, token)).toBe(false);
    expect(await anon.getDraft(id, token)).toBeNull();
    expect((await new MemoryStore(db, "u1").getProfile())?.cv).toBe(cv);
  });

  it("drafts expire after seven days", async () => {
    const db = createMemoryDb();
    let t = new Date("2026-09-01T00:00:00Z");
    const s = new MemoryStore(db, null, () => t);
    const { id, token } = await s.createDraft(cv);
    t = new Date("2026-09-09T00:00:00Z");
    expect(await s.getDraft(id, token)).toBeNull();
  });

  it("isolates kits and tracker rows per owner and never refunds usage", async () => {
    const db = createMemoryDb();
    const a = new MemoryStore(db, "a");
    const b = new MemoryStore(db, "b");
    const kit = { id: "k1", jobId: "j1", createdAt: "2026-09-01", status: "draft" } as never;
    await a.saveKit(kit);
    expect(await b.getKit("k1")).toBeNull();
    await expect(b.saveKit(kit)).rejects.toBeInstanceOf(NotSignedInError);
    await a.recordUsage("kit");
    await a.deleteMyData();
    expect(await a.countUsage("kit", "2000-01-01")).toBe(1);
    expect(await a.listKits()).toEqual([]);
  });

  it("rate limits per user within the window and refuses anonymous callers", async () => {
    const db = createMemoryDb();
    const s = new MemoryStore(db, "u1");
    expect(await s.rateLimit("kit", 60, 2)).toBe(true);
    expect(await s.rateLimit("kit", 60, 2)).toBe(true);
    expect(await s.rateLimit("kit", 60, 2)).toBe(false);
    expect(await new MemoryStore(db, "u2").rateLimit("kit", 60, 2)).toBe(true);
    expect(await new MemoryStore(db, null).rateLimit("kit", 60, 2)).toBe(false);
  });

  it("admin closes jobs and maps stripe customers", async () => {
    const db = createMemoryDb([job]);
    const admin = new MemoryAdminStore(db);
    await admin.closeJobs(["j1"], "2026-09-27T00:00:00Z");
    expect(await new MemoryStore(db, null).listJobFeatures()).toEqual([]);
    await admin.setPlan("u1", "pro", { customerId: "cus_1", status: "active" });
    expect(await admin.userIdForCustomer("cus_1")).toBe("u1");
    expect(await new MemoryStore(db, "u1").getPlan()).toBe("pro");
  });
});

describe("MemoryStore portfolios", () => {
  it("keeps pages private until published and blocks slug theft", async () => {
    const db = createMemoryDb();
    const a = new MemoryStore(db, "a");
    const page = { id: "p1", slug: "jordan-avery-data", published: false } as never;
    await a.savePortfolio(page);
    const anon = new MemoryStore(db, null);
    expect(await anon.getPublishedPortfolio("jordan-avery-data")).toBeNull();
    await a.savePortfolio({ ...(page as object), published: true } as never);
    expect((await anon.getPublishedPortfolio("jordan-avery-data"))?.slug).toBe("jordan-avery-data");
    await expect(new MemoryStore(db, "b").savePortfolio({ id: "p2", slug: "jordan-avery-data" } as never)).rejects.toThrow();
    await a.deleteMyData();
    expect(await anon.getPublishedPortfolio("jordan-avery-data")).toBeNull();
  });
});
