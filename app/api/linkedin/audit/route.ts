import { getBackend } from "@/lib/backend";
import { CvError, extractText, MAX_UPLOAD_BYTES } from "@/lib/cv/extract";
import { auditProfile, readProfile } from "@/lib/linkedin/profile";
import { allow, clientIp } from "@/lib/ratelimit";
import { json, sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

// Audits a LinkedIn "Save to PDF" export. The text is read, scored and dropped, nothing is stored.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Request blocked." }, 403);
  if (!allow(`linkedin:${clientIp(req.headers)}`, 600, 10)) {
    return json({ ok: false, error: "Too many uploads from this connection. Try again in ten minutes." }, 429);
  }
  const { user } = await getBackend();
  if (!user) return json({ ok: false, error: "Sign in to audit your profile." }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "The upload was incomplete. Try again." }, 400);
  }
  const file = form.get("profile");
  if (!(file instanceof File) || file.size === 0) return json({ ok: false, error: "Choose your LinkedIn PDF first." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ ok: false, error: "That file is over 4 MB." }, 413);

  try {
    const { text } = await extractText(new Uint8Array(await file.arrayBuffer()));
    return json({ ok: true, audit: auditProfile(readProfile(text)) });
  } catch (err) {
    if (err instanceof CvError) return json({ ok: false, error: err.message }, 400);
    console.error("linkedin audit: failed", err instanceof Error ? err.name : "unknown");
    return json({ ok: false, error: "We could not read that file. Save your profile as a PDF again and retry." }, 400);
  }
}
