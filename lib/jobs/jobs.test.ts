import { describe, expect, it, vi } from "vitest";
import type { JobPosting } from "@/lib/types";
import { analyzeJob } from "@/lib/match";
import { boardKey } from "./boards";
import { htmlToText } from "./html";
import { ingestAll } from "./ingest";
import { reconcile } from "./liveness";
import { detectRemote, inferCountry } from "./location";
import { cleanTitle, normalizeJob } from "./normalize";
import { parseSalary } from "./salary";
import { fetchGreenhouse } from "./sources/greenhouse";

const NOW = new Date("2026-10-01T00:00:00Z");

const ghJobs = {
  jobs: [
    {
      id: 101,
      title: "Reporting Analyst - Melbourne",
      absolute_url: "https://boards.greenhouse.io/quillfeather/jobs/101",
      company_name: "Quillfeather Analytics",
      location: { name: "Melbourne, Victoria, Australia" },
      content: "&lt;p&gt;You will use &lt;strong&gt;SQL&lt;/strong&gt; &amp;amp; Power BI.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;3+ years experience&lt;/li&gt;&lt;/ul&gt;",
      first_published: "2026-09-25T00:00:00Z",
    },
    { id: "not-a-number", title: "", absolute_url: "javascript:alert(1)" },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("html and normalisation helpers", () => {
  it("decodes double encoded HTML into plain text with bullets", () => {
    const text = htmlToText("&lt;p&gt;A &amp;amp; B&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;");
    expect(htmlToText("<p>Keep</p><script>x()</script>")).toBe("Keep");
    expect(text).toContain("A & B");
    expect(text).toMatch(/• One/);
    expect(text).not.toContain("<");
  });

  it("cleans titles, infers country and arrangement, parses salary", () => {
    expect(cleanTitle("Data Analyst - Sydney (m/f/d)", "Acme")).toBe("Data Analyst");
    expect(cleanTitle("Acme Data Analyst", "Acme")).toBe("Data Analyst");
    expect(cleanTitle("Deputy Manager", "Deputy")).toBe("Deputy Manager");
    expect(cleanTitle("Analyst - Acme", "Acme")).toBe("Analyst");
    expect(inferCountry("Melbourne VIC")).toBe("AU");
    expect(inferCountry("Remote - Australia")).toBe("AU");
    expect(inferCountry("Auckland, New Zealand")).toBe("NZ");
    expect(detectRemote({ title: "Engineer", location: "Remote" })).toBe("remote");
    expect(detectRemote({ workplace: "hybrid", title: "x", location: "Sydney" })).toBe("hybrid");
    expect(parseSalary("$120,000 - $140,000", "AUD")).toMatchObject({ min: 120000, max: 140000, currency: "AUD", period: "year" });
    expect(parseSalary("$65/hour", "AUD")).toMatchObject({ min: 65, period: "hour" });
  });
});

describe("greenhouse source", () => {
  it("validates items, decodes content and skips malformed rows", async () => {
    const fetch = vi.fn(async () => json(ghJobs));
    const raw = await fetchGreenhouse("quillfeather", { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(raw).toHaveLength(1);
    expect(raw[0].description).toContain("SQL & Power BI");
    const job = normalizeJob(raw[0], { now: NOW, analyze: analyzeJob });
    expect(job.title).toBe("Reporting Analyst");
    expect(job.country).toBe("AU");
    expect(job.skills).toEqual(expect.arrayContaining(["SQL", "Power BI"]));
    expect(job.requirements.minYears).toBe(3);
    expect(job.status).toBe("open");
  });
});

describe("ingestAll", () => {
  it("isolates failing boards and keeps going", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes("/good/")) return json(ghJobs);
      if (url.includes("/broken/")) return json({}, 500);
      throw new DOMException("timed out", "TimeoutError");
    });
    const res = await ingestAll(
      [
        { source: "greenhouse", board: "good", label: "Good" },
        { source: "greenhouse", board: "broken", label: "Broken" },
        { source: "greenhouse", board: "slow", label: "Slow" },
      ],
      { fetch: fetch as unknown as typeof globalThis.fetch, now: NOW, analyze: analyzeJob },
    );
    expect(res.jobs).toHaveLength(1);
    expect(res.okBoards).toEqual([boardKey("greenhouse", "good")]);
    expect(res.errors.map((e) => e.board).sort()).toEqual(expect.arrayContaining([expect.stringContaining("broken"), expect.stringContaining("slow")]));
  });
});

describe("reconcile", () => {
  const job = (id: string, board: string, extra: Partial<JobPosting> = {}): JobPosting =>
    ({ id, source: "greenhouse", board, sourceId: id, status: "open", retrievedAt: "2026-09-01T00:00:00.000Z", lastCheckedAt: "", ...extra }) as JobPosting;

  it("closes jobs missing from boards that answered, leaves failed boards alone, keeps first seen", () => {
    const existing = [job("a", "good"), job("b", "good"), job("c", "down")];
    const fresh = [job("a", "good", { retrievedAt: "2026-10-01T00:00:00.000Z" })];
    const res = reconcile(existing, fresh, [boardKey("greenhouse", "good")], NOW);
    expect(res.closedIds).toEqual(["b"]);
    expect(res.upserts[0].retrievedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(res.upserts[0].lastCheckedAt).toBe(NOW.toISOString());
  });

  it("closes jobs whose closing date has passed", () => {
    const fresh = [job("d", "good", { closesAt: "2026-09-20T00:00:00.000Z" })];
    expect(reconcile([], fresh, [boardKey("greenhouse", "good")], NOW).upserts[0].status).toBe("closed");
  });
});
