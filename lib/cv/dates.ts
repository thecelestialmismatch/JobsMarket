// Date ranges as CVs write them, normalised to "YYYY-MM" or "present".

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const YEAR = "(?:19|20)\\d{2}";
const DATE = `(?:${MONTH},?\\s+${YEAR}|(?:0?[1-9]|1[0-2])\\/${YEAR}|${YEAR}-(?:0[1-9]|1[0-2])(?!\\d)|${YEAR})`;
const OPEN_END = "(?:present|current|now|today|ongoing|date)";
const SEP = "(?:\\s*-\\s*|\\s+(?:to|until|till|through)\\s+)";
const RANGE_RE = new RegExp(`(?<![\\w/])(${DATE})${SEP}(${DATE}|${OPEN_END})(?![\\w/])`, "i");
const YEAR_RE = new RegExp(`(?<![\\w/])${YEAR}(?![\\w/])`, "g");

export interface DateRange {
  start: string;
  end: string;
  /** The exact text that matched, so callers can remove it from the line. */
  match: string;
}

function pad(month: number): string {
  return String(month).padStart(2, "0");
}

/**
 * One date token to "YYYY-MM". Year only resolves to January so that totals are never inflated.
 * Open ended words ("Present", "Current") become "present".
 */
export function parseDateToken(token: string): string | null {
  const t = token.trim().toLowerCase().replace(/,/g, "");
  if (new RegExp(`^${OPEN_END}$`).test(t)) return "present";
  const named = /^([a-z]+)\.?\s+(\d{4})$/.exec(t);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3));
    return month === -1 ? null : `${named[2]}-${pad(month + 1)}`;
  }
  const slashed = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (slashed) return `${slashed[2]}-${pad(Number(slashed[1]))}`;
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  if (/^\d{4}$/.test(t)) return `${t}-01`;
  return null;
}

export function findDateRange(line: string): DateRange | null {
  const m = RANGE_RE.exec(line);
  if (!m) return null;
  const start = parseDateToken(m[1]);
  const end = parseDateToken(m[2]);
  if (!start || !end) return null;
  return { start, end, match: m[0] };
}

/** The last four digit year on a line, as "YYYY-01", for single dated lines such as a graduation year. */
export function findYear(line: string): string | null {
  const years = line.match(YEAR_RE);
  return years ? `${years[years.length - 1]}-01` : null;
}

function monthIndex(ym: string, now: Date): number {
  if (ym === "present") return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * Total months covered by the ranges, counting both end months and merging overlaps so that
 * concurrent roles are not double counted.
 */
export function mergedMonths(ranges: { start: string; end: string }[], now: Date): number {
  const spans = ranges
    .map((r) => [monthIndex(r.start, now), monthIndex(r.end, now) + 1] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let open: [number, number] | null = null;
  for (const [s, e] of spans) {
    if (open && s <= open[1]) open = [open[0], Math.max(open[1], e)];
    else {
      if (open) total += open[1] - open[0];
      open = [s, e];
    }
  }
  return open ? total + open[1] - open[0] : total;
}
