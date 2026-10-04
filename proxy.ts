import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { supabaseEnv } from "@/lib/supabase/env";

// Refreshes the auth session once per navigation and keeps signed out visitors out of /app.
// Pages under /app still verify the user themselves; this is the first gate, not the only one.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (supabaseEnv()) {
    const result = await updateSession(request);
    response = result.response;
    signedIn = Boolean(result.userId);
  } else {
    signedIn = Boolean(request.cookies.get("jm_session")?.value);
  }

  if (pathname.startsWith("/app") && !signedIn) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
