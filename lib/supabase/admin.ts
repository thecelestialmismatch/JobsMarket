import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** Service role client. Only for the ingestion cron and billing webhook. Null until the key is set. */
export function createSupabaseAdmin() {
  const env = supabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) return null;
  return createClient(env.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
