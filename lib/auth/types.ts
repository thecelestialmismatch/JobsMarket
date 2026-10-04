import type { SessionUser } from "@/lib/types";

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

export interface Auth {
  getUser(): Promise<SessionUser | null>;
  signUp(email: string, password: string, redirectTo: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

/** Minimal cookie jar so auth works with next/headers cookies() and in tests. */
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, opts: { maxAge: number }): void;
  delete(name: string): void;
}

export const MIN_PASSWORD = 8;

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "Enter a valid email address.";
  if (password.length < MIN_PASSWORD || password.length > 128) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  return null;
}
