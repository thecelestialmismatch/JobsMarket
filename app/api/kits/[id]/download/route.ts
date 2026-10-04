import type { NextRequest } from "next/server";
import { getBackend } from "@/lib/backend";
import { renderDocx, renderKitZip, renderText } from "@/lib/writing/docx";
import { safeFileBase } from "@/lib/server/kits";

export const runtime = "nodejs";

const NAMES: Record<string, string> = {
  cv: "CV",
  cover_letter: "Cover_Letter",
  portfolio: "Portfolio",
  outreach: "Outreach",
  linkedin: "LinkedIn",
  interview_prep: "Interview_Prep",
};

function file(body: Uint8Array | string, name: string, type: string): Response {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/kits/[id]/download">) {
  const { id } = await ctx.params;
  const { store, user } = await getBackend();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const kit = await store.getKit(id);
  if (!kit) return new Response("Not found.", { status: 404 });

  const profile = await store.getProfile();
  const base = safeFileBase(profile?.cv.contact.name);
  const which = req.nextUrl.searchParams.get("doc") ?? "all";

  if (which === "all") return file(await renderKitZip(kit, base), `${base}_Application_Kit.zip`, "application/zip");
  const doc = kit.documents.find((d) => d.kind === which);
  if (!doc) return new Response("Not found.", { status: 404 });
  if (req.nextUrl.searchParams.get("format") === "txt") {
    return file(renderText(doc), `${base}_${NAMES[doc.kind]}.txt`, "text/plain; charset=utf-8");
  }
  return file(
    await renderDocx(doc),
    `${base}_${NAMES[doc.kind]}.docx`,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}
