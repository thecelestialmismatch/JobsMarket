import { describe, expect, it } from "vitest";
import { siteUrl } from "./site";

describe("siteUrl", () => {
  it("prefers APP_URL and drops trailing slashes", () => {
    expect(siteUrl({ APP_URL: "https://jobsmarket.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe(
      "https://jobsmarket.example",
    );
  });

  it("falls back to the Vercel production host, then localhost", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "jobs-market.vercel.app" })).toBe("https://jobs-market.vercel.app");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});
