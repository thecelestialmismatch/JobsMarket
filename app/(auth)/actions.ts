"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/backend";
import { allow, clientIp } from "@/lib/ratelimit";
import { claimPendingDraft } from "@/lib/server/cookies";

export interface AuthState {
  error?: string;
  info?: string;
}

async function guard(): Promise<string | null> {
  const h = await headers();
  return allow(`auth:${clientIp(h)}`, 600, 20) ? null : "Too many attempts. Wait ten minutes and try again.";
}

function nextPath(raw: FormDataEntryValue | null): string {
  const p = typeof raw === "string" ? raw : "";
  return p.startsWith("/app") && !p.startsWith("//") ? p : "/app";
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const limited = await guard();
  if (limited) return { error: limited };
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { auth } = await getBackend();
  const res = await auth.signUp(String(form.get("email") ?? ""), String(form.get("password") ?? ""), `${origin}/auth/callback`);
  if (!res.ok) return { error: res.error };
  if (res.needsConfirmation) {
    return { info: "Check your inbox and open the confirmation link. Your uploaded CV will be waiting when you sign in." };
  }
  const { store } = await getBackend();
  await claimPendingDraft(store);
  redirect(form.get("plan") === "pro" ? "/app/settings?upgrade=pro" : "/app");
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const limited = await guard();
  if (limited) return { error: limited };
  const { auth } = await getBackend();
  const res = await auth.signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!res.ok) return { error: res.error };
  const { store } = await getBackend();
  await claimPendingDraft(store);
  redirect(nextPath(form.get("next")));
}

export async function signOutAction(): Promise<void> {
  const { auth } = await getBackend();
  await auth.signOut();
  redirect("/");
}
