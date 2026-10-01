import { describe, expect, it } from "vitest";
import { allow, clientIp } from "./ratelimit";

describe("ratelimit", () => {
  it("allows up to max per window then recovers", () => {
    expect(allow("ip:a", 60, 2, 0)).toBe(true);
    expect(allow("ip:a", 60, 2, 1)).toBe(true);
    expect(allow("ip:a", 60, 2, 2)).toBe(false);
    expect(allow("ip:a", 60, 2, 61_000)).toBe(true);
  });
  it("reads the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
