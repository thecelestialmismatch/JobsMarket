import { z } from "zod";
import type { JobPosting } from "@/lib/types";

export type FetchDeps = { fetch: typeof fetch; timeoutMs?: number; userAgent?: string };

export type RawSource = "greenhouse" | "lever" | "ashby" | "remotive" | "adzuna";

export interface RawSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: JobPosting["salaryPeriod"];
}

/** One advert as a source reported it, already reduced to plain text. Input to normalizeJob. */
export interface RawJob {
  source: RawSource;
  board: string;
  sourceId: string;
  /** null when the API does not expose the employer name (Lever, Ashby). Ingest fills it from the board label. */
  company: string | null;
  title: string;
  location: string;
  description: string;
  url: string;
  applyUrl: string;
  postedAt?: string;
  closesAt?: string;
  employmentType?: string;
  /** Structured workplace hint as the source spells it, e.g. "hybrid", "OnSite", "remote". */
  workplace?: string;
  isRemote?: boolean;
  /** ISO-2 code or country name from a structured field. */
  countryHint?: string;
  salary?: RawSalary;
  /** Free text salary field, e.g. Remotive's "$90k - $105k". */
  salaryText?: string;
}

export class SourceError extends Error {
  readonly source: RawSource;
  readonly board: string;
  /** HTTP status, or null for timeouts, network failures and unreadable bodies. */
  readonly status: number | null;

  constructor(source: RawSource, board: string, status: number | null, message: string) {
    super(message);
    this.name = "SourceError";
    this.source = source;
    this.board = board;
    this.status = status;
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_UA = "JobsMarket/0.1 (job ingest)";

function describe(err: unknown): string {
  if (err instanceof Error) return err.name === "TimeoutError" ? "timed out" : err.message;
  return String(err);
}

/** GET a JSON document. The URL never appears in errors because some carry API keys. */
export async function fetchJson(url: string, source: RawSource, board: string, deps: FetchDeps): Promise<unknown> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await deps.fetch(url, {
      headers: { accept: "application/json", "user-agent": deps.userAgent ?? DEFAULT_UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new SourceError(source, board, null, `${source} board ${board} request failed (${describe(err)})`);
  }
  if (!res.ok) throw new SourceError(source, board, res.status, `${source} board ${board} returned HTTP ${res.status}`);
  try {
    return await res.json();
  } catch (err) {
    throw new SourceError(source, board, res.status, `${source} board ${board} sent an unreadable body (${describe(err)})`);
  }
}

/**
 * Validate each item on its own and keep the good ones. A non empty list with no valid item means the
 * API shape changed, which must fail the board so liveness does not close every job it holds.
 */
export function parseItems<T>(items: unknown[], schema: z.ZodType<T>, source: RawSource, board: string): T[] {
  const ok = items.flatMap((item) => {
    const r = schema.safeParse(item);
    return r.success ? [r.data] : [];
  });
  if (items.length > 0 && ok.length === 0) {
    throw new SourceError(source, board, null, `${source} board ${board} returned no item matching the expected shape`);
  }
  return ok;
}

export function parseEnvelope<T>(body: unknown, schema: z.ZodType<T>, source: RawSource, board: string): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new SourceError(source, board, null, `${source} board ${board} returned an unexpected shape`);
  return r.data;
}

export const httpUrl = z.url({ protocol: /^https?$/ });

/** ISO 8601 in UTC, or undefined when the input does not parse. Bare timestamps are read as UTC. */
export function toIso(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const v = typeof value === "string" && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const EMPLOYMENT: Record<string, string> = {
  fulltime: "Full-time",
  parttime: "Part-time",
  contract: "Contract",
  contractor: "Contract",
  intern: "Internship",
  internship: "Internship",
  temporary: "Temporary",
  freelance: "Freelance",
  permanent: "Permanent",
};

export function employmentLabel(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return EMPLOYMENT[value.toLowerCase().replace(/[^a-z]/g, "")] ?? value.trim();
}
