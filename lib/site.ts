/** Absolute origin for canonical links, the sitemap and robots. APP_URL wins, then Vercel's production host. */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** Public marketing pages, in sitemap order. */
export const PUBLIC_PAGES = ["/", "/compare/aiapply-alternative"] as const;
