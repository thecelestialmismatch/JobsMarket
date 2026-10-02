import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { SessionUser } from "@/lib/types";
import type { Auth, CookieJar } from "@/lib/auth/types";
import type { AdminStore, Store } from "@/lib/store/types";
import { createMemoryUsers, MemoryAuth, type MemoryUsers } from "@/lib/auth/memory";
import { SupabaseAuth } from "@/lib/auth/supabase";
import { createMemoryDb, MemoryAdminStore, MemoryStore, type MemoryDb } from "@/lib/store/memory";
import { SupabaseAdminStore, SupabaseStore } from "@/lib/store/supabase";
import { supabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { demoJobs } from "@/lib/store/demo-jobs";

export class ConfigError extends Error {
  constructor() {
    super("JobsMarket is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
    this.name = "ConfigError";
  }
}

export type Mode = "supabase" | "memory";

/**
 * Supabase whenever it is configured. Memory mode only when explicitly requested and never on
 * Vercel, so a deployment with missing variables fails closed instead of silently storing CVs
 * in a process that forgets them.
 */
export function backendMode(): Mode {
  if (supabaseEnv()) return "supabase";
  if (process.env.JM_STORE === "memory" && !process.env.VERCEL) return "memory";
  throw new ConfigError();
}

const g = globalThis as unknown as { __jm?: { db: MemoryDb; users: MemoryUsers } };
function memory() {
  g.__jm ??= { db: createMemoryDb(demoJobs()), users: createMemoryUsers(process.env.JM_SESSION_SECRET) };
  return g.__jm;
}

async function cookieJar(): Promise<CookieJar> {
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, opts) =>
      store.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: opts.maxAge,
      }),
    delete: (name) => store.delete(name),
  };
}

export interface Backend {
  mode: Mode;
  store: Store;
  auth: Auth;
  user: SessionUser | null;
}

export async function getBackend(): Promise<Backend> {
  await connection(); // per request data, never prerendered
  const mode = backendMode();
  if (mode === "supabase") {
    const db = await createSupabaseServer();
    const auth = new SupabaseAuth(db);
    const user = await auth.getUser();
    return { mode, auth, user, store: new SupabaseStore(db, user) };
  }
  const m = memory();
  const auth = new MemoryAuth(m.users, await cookieJar());
  const user = await auth.getUser();
  return { mode, auth, user, store: new MemoryStore(m.db, user?.id ?? null) };
}

/** Service role access. Null until SUPABASE_SERVICE_ROLE_KEY is set (memory mode always has it). */
export function getAdminStore(): AdminStore | null {
  const mode = backendMode();
  if (mode === "memory") return new MemoryAdminStore(memory().db);
  const admin = createSupabaseAdmin();
  return admin ? new SupabaseAdminStore(admin) : null;
}
