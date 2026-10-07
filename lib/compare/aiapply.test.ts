import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";
import { lintText } from "@/lib/writing/lint";
import { allCopy, FAQ, ROWS } from "./aiapply";

describe("AIApply comparison copy", () => {
  it("passes the same style rules as generated documents", () => {
    const issues = allCopy().flatMap((text) => lintText(text).map((i) => `${i.rule}: ${i.excerpt}`));
    expect(issues).toEqual([]);
  });

  it("quotes JobsMarket prices and limits from the plans", () => {
    const pricing = ROWS.find((r) => r.topic === "How it is priced");
    expect(pricing?.jobsmarket).toContain(PLANS.pro.price);
    const free = FAQ[0].a;
    expect(free).toContain(`${PLANS.free.limits.scan} CV scans`);
    expect(free).toContain(`${PLANS.free.limits.kit} application kits`);
    expect(free).toContain(`${PLANS.pro.limits.kit} kits`);
  });

  it("states the published rubric with weights that add up to 100", () => {
    const rubric = ROWS.find((r) => r.topic === "How fit is scored")?.jobsmarket ?? "";
    const weights = [...rubric.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
  });
});
