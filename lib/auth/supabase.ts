import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/types";
import { validateCredentials, type Auth, type AuthResult } from "./types";

export class SupabaseAuth implements Auth {
  constructor(private readonly db: SupabaseClient) {}

  async getUser(): Promise<SessionUser | null> {
    // getClaims verifies the JWT, getSession alone would trust the cookie.
    const { data, error } = await this.db.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return null;
    return { id: claims.sub, email: (claims.email as string | undefined) ?? "" };
  }

  async signUp(email: string, password: string, redirectTo: string): Promise<AuthResult> {
    const invalid = validateCredentials(email.trim(), password);
    if (invalid) return { ok: false, error: invalid };
    const { data, error } = await this.db.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { ok: false, error: "We could not create that account. Check the email address or sign in instead." };
    return { ok: true, needsConfirmation: !data.session };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await this.db.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (!error) return { ok: true };
    if (error.code === "email_not_confirmed") return { ok: false, error: "Confirm your email first. The link is in your inbox." };
    return { ok: false, error: "Email or password is incorrect." };
  }

  async signOut() {
    await this.db.auth.signOut();
  }
}
