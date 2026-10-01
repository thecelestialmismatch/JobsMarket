import "server-only";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Rejects cross-site state changing requests. SameSite cookies already block most, this closes the rest. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
