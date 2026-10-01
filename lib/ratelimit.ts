// Per instance sliding window limiter for anonymous traffic (keyed by IP). Best effort on
// serverless: each instance keeps its own window. The database still caps anonymous uploads
// globally inside create_draft.
// ponytail: per-instance memory, move to a shared store (Upstash, Postgres) if abuse appears.

const windows = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function allow(key: string, windowSec: number, max: number, now = Date.now()): boolean {
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
  if (recent.length >= max) return false;
  if (!windows.has(key) && windows.size >= MAX_KEYS) windows.clear();
  windows.set(key, [...recent, now]);
  return true;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
