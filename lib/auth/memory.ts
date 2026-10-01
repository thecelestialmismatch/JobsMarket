import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "@/lib/types";
import { validateCredentials, type Auth, type AuthResult, type CookieJar } from "./types";

// Local auth for memory mode only. scrypt password hashes, HMAC signed session cookie.

export const SESSION_COOKIE = "jm_session";
const SESSION_TTL_SEC = 14 * 24 * 3600;

interface UserRecord {
  id: string;
  email: string;
  salt: Buffer;
  hash: Buffer;
}

export interface MemoryUsers {
  byEmail: Map<string, UserRecord>;
  secret: Buffer;
}

export function createMemoryUsers(secret?: string): MemoryUsers {
  return { byEmail: new Map(), secret: secret ? Buffer.from(secret) : randomBytes(32) };
}

const hashPassword = (password: string, salt: Buffer) => scryptSync(password, salt, 32);

function sign(users: MemoryUsers, payload: string): string {
  return createHmac("sha256", users.secret).update(payload).digest("base64url");
}

export class MemoryAuth implements Auth {
  constructor(
    private readonly users: MemoryUsers,
    private readonly jar: CookieJar,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getUser(): Promise<SessionUser | null> {
    const raw = this.jar.get(SESSION_COOKIE);
    if (!raw) return null;
    const [id, exp, mac] = raw.split(".");
    if (!id || !exp || !mac) return null;
    const expected = Buffer.from(sign(this.users, `${id}.${exp}`));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (Number(exp) * 1000 < this.now().getTime()) return null;
    for (const u of this.users.byEmail.values()) if (u.id === id) return { id: u.id, email: u.email };
    return null;
  }

  private startSession(id: string) {
    const exp = Math.floor(this.now().getTime() / 1000) + SESSION_TTL_SEC;
    this.jar.set(SESSION_COOKIE, `${id}.${exp}.${sign(this.users, `${id}.${exp}`)}`, { maxAge: SESSION_TTL_SEC });
  }

  async signUp(emailRaw: string, password: string, _redirectTo?: string): Promise<AuthResult> {
    const email = emailRaw.trim().toLowerCase();
    const invalid = validateCredentials(email, password);
    if (invalid) return { ok: false, error: invalid };
    if (this.users.byEmail.has(email)) return { ok: false, error: "An account with that email already exists. Sign in instead." };
    const salt = randomBytes(16);
    const user = { id: randomUUID(), email, salt, hash: hashPassword(password, salt) };
    this.users.byEmail.set(email, user);
    this.startSession(user.id);
    return { ok: true, needsConfirmation: false };
  }

  async signIn(emailRaw: string, password: string): Promise<AuthResult> {
    const email = emailRaw.trim().toLowerCase();
    const user = this.users.byEmail.get(email);
    const salt = user?.salt ?? randomBytes(16); // equal work for unknown emails
    const hash = hashPassword(password, salt);
    if (!user || !timingSafeEqual(hash, user.hash)) return { ok: false, error: "Email or password is incorrect." };
    this.startSession(user.id);
    return { ok: true };
  }

  async signOut() {
    this.jar.delete(SESSION_COOKIE);
  }
}
