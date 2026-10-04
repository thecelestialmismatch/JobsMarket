import "server-only";
import { ConfigError, getBackend } from "@/lib/backend";

/** For public marketing pages: an unconfigured backend renders as signed out instead of crashing. */
export async function signedInSafe(): Promise<boolean> {
  try {
    return Boolean((await getBackend()).user);
  } catch (err) {
    if (err instanceof ConfigError) return false;
    throw err;
  }
}
