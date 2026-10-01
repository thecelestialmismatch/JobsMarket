import { describe, expect, it } from "vitest";
import { createMemoryUsers, MemoryAuth, SESSION_COOKIE } from "./memory";
import type { CookieJar } from "./types";

function jar(): CookieJar & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (n) => data.get(n), set: (n, v) => void data.set(n, v), delete: (n) => void data.delete(n) };
}

describe("MemoryAuth", () => {
  it("signs up, keeps a signed session and signs out", async () => {
    const users = createMemoryUsers("test-secret");
    const j = jar();
    const auth = new MemoryAuth(users, j);
    expect(await auth.signUp("Jordan@Example.com", "correct horse", "/")).toEqual({ ok: true, needsConfirmation: false });
    expect((await auth.getUser())?.email).toBe("jordan@example.com");
    await auth.signOut();
    expect(await auth.getUser()).toBeNull();
  });

  it("rejects bad credentials, duplicates and tampered cookies", async () => {
    const users = createMemoryUsers("test-secret");
    const j = jar();
    const auth = new MemoryAuth(users, j);
    expect((await auth.signUp("bad", "short", "/")).ok).toBe(false);
    await auth.signUp("a@example.com", "password123", "/");
    expect((await auth.signUp("a@example.com", "password123", "/")).ok).toBe(false);
    expect((await auth.signIn("a@example.com", "wrong-pass")).ok).toBe(false);
    expect((await auth.signIn("a@example.com", "password123")).ok).toBe(true);
    const [id, exp] = j.data.get(SESSION_COOKIE)!.split(".");
    j.data.set(SESSION_COOKIE, `${id}.${Number(exp) + 999}.forged`);
    expect(await auth.getUser()).toBeNull();
  });

  it("expires sessions", async () => {
    const users = createMemoryUsers("s");
    const j = jar();
    let t = new Date("2026-09-01T00:00:00Z");
    const auth = new MemoryAuth(users, j, () => t);
    await auth.signUp("b@example.com", "password123", "/");
    t = new Date("2026-10-01T00:00:00Z");
    expect(await auth.getUser()).toBeNull();
  });
});
