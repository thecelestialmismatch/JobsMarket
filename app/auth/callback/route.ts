import { NextResponse, type NextRequest } from "next/server";
import { getBackend } from "@/lib/backend";
import { claimPendingDraft } from "@/lib/server/cookies";
import { createSupabaseServer } from "@/lib/supabase/server";

// Supabase email confirmation lands here with a one time code (PKCE).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const fail = NextResponse.redirect(new URL("/login?error=confirm", request.url));
  if (!code) return fail;
  try {
    const db = await createSupabaseServer();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return fail;
    const { store } = await getBackend();
    await claimPendingDraft(store);
    return NextResponse.redirect(new URL("/app", request.url));
  } catch {
    return fail;
  }
}
