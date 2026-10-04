import { describe, expect, it } from "vitest";
import type { TrackerRow } from "@/lib/types";
import { followUpDue, TrackerInput, trackerStats } from "./tracker";

const row = (status: TrackerRow["status"], followUpAt?: string): TrackerRow => ({
  id: "x", company: "C", role: "R", status, followUpAt, createdAt: "", updatedAt: "",
});

describe("tracker", () => {
  it("computes response and interview rates over sent applications only", () => {
    const s = trackerStats([row("saved"), row("applied"), row("interview"), row("rejected"), row("offer")]);
    expect(s).toEqual({ total: 5, applied: 4, responseRate: 75, interviewRate: 50 });
    expect(trackerStats([]).responseRate).toBe(0);
  });
  it("flags due follow ups only for waiting applications", () => {
    expect(followUpDue(row("applied", "2026-09-01"), "2026-09-02")).toBe(true);
    expect(followUpDue(row("interview", "2026-09-01"), "2026-09-02")).toBe(false);
    expect(followUpDue(row("applied", "2026-09-05"), "2026-09-02")).toBe(false);
  });
  it("validates input and rejects non web links", () => {
    expect(TrackerInput.safeParse({ company: "A", role: "B", status: "applied" }).success).toBe(true);
    expect(TrackerInput.safeParse({ company: "", role: "B", status: "applied" }).success).toBe(false);
    expect(TrackerInput.safeParse({ company: "A", role: "B", status: "applied", applyUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});
