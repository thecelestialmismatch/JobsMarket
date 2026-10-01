import type { JobPosting } from "@/lib/types";

export type SalaryPeriod = NonNullable<JobPosting["salaryPeriod"]>;

export interface ParsedSalary {
  min: number;
  max: number;
  currency?: string;
  period: SalaryPeriod;
}

const COUNTRY_CURRENCY: Record<string, string> = {
  AU: "AUD", NZ: "NZD", GB: "GBP", US: "USD", CA: "CAD", SG: "SGD", IN: "INR",
};

export function currencyForCountry(country: string | undefined): string | undefined {
  return country ? COUNTRY_CURRENCY[country] : undefined;
}

// Longest symbols first so "A$" wins over "$".
const SYMBOLS: [string, string | null][] = [
  ["AU$", "AUD"], ["A$", "AUD"], ["NZ$", "NZD"], ["US$", "USD"], ["CA$", "CAD"], ["C$", "CAD"], ["S$", "SGD"],
  ["AUD", "AUD"], ["NZD", "NZD"], ["USD", "USD"], ["CAD", "CAD"], ["SGD", "SGD"], ["GBP", "GBP"], ["EUR", "EUR"],
  ["INR", "INR"], ["\u00a3", "GBP"], ["\u20ac", "EUR"], ["\u20b9", "INR"], ["$", null],
];
const CODES = ["AUD", "NZD", "USD", "CAD", "SGD", "GBP", "EUR", "INR"];

const esc = (s: string): string => s.replace(/[$]/g, "\\$");
const CUR = `(${SYMBOLS.map(([s]) => esc(s)).join("|")})`;
const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)\\s?([kK])?";
const SEP = "\\s*(?:-|\u2013|\u2014|to)\\s*";
const RANGE = new RegExp(`${CUR}?\\s?${NUM}(?:${SEP}${CUR}?\\s?${NUM})?(?:\\s?(${CODES.join("|")})\\b)?`, "g");

const BOUNDS: Record<SalaryPeriod, [number, number]> = {
  year: [10_000, 10_000_000],
  month: [800, 1_000_000],
  day: [80, 10_000],
  hour: [10, 1_000],
};

const TAIL_PERIOD: [SalaryPeriod, RegExp][] = [
  ["hour", /^[^.\n]{0,25}?(?:\/\s*h(?:ou)?r\b|\bper\s+hour\b|\ban\s+hour\b|\bhourly\b|\bp\/?h\b)/i],
  ["day", /^[^.\n]{0,25}?(?:\/\s*day\b|\bper\s+day\b|\ba\s+day\b|\bdaily\b|\bp\/?d\b)/i],
  ["month", /^[^.\n]{0,25}?(?:\/\s*(?:month|mth|mo)\b|\bper\s+month\b|\ba\s+month\b|\bmonthly\b)/i],
  ["year", /^[^.\n]{0,25}?(?:\/\s*(?:year|yr|annum)\b|\bper\s+(?:year|annum)\b|\ba\s+year\b|\bp\.?\s?a\b|\bannually\b)/i],
];
const HEAD_PERIOD: [SalaryPeriod, RegExp][] = [
  ["hour", /\b(?:hourly|per hour|hour rate)\b[^.\n]{0,20}$/i],
  ["day", /\b(?:day rate|daily rate|per day)\b[^.\n]{0,20}$/i],
  ["month", /\b(?:monthly|per month)\b[^.\n]{0,20}$/i],
];

function toNumber(raw: string, k: string | undefined): number {
  const s = raw.replace(/,+$/, "");
  let n: number;
  if (/^\d{1,3}(?:,\d{2,3})+(?:\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, ""));
  else if (/^\d+,\d{1,2}$/.test(s)) n = Number(s.replace(",", ".")); // "35,3k" decimal comma
  else n = Number(s);
  return k ? n * 1000 : n;
}

function periodFor(head: string, tail: string, max: number): SalaryPeriod | null {
  for (const [p, re] of TAIL_PERIOD) if (re.test(tail)) return p;
  for (const [p, re] of HEAD_PERIOD) if (re.test(head)) return p;
  return max >= BOUNDS.year[0] ? "year" : null;
}

function symbolCurrency(symbol: string | undefined): string | null | undefined {
  if (!symbol) return undefined;
  return SYMBOLS.find(([s]) => s === symbol)?.[1];
}

function fromMatch(m: RegExpMatchArray, text: string, fallbackCurrency?: string): ParsedSalary | null {
  const [whole, cur1, n1, k1, cur2, n2, k2, code] = m;
  if (!cur1 && !code) return null;
  const at = m.index ?? 0;
  const tail = text.slice(at + whole.length, at + whole.length + 40);
  if (/^\s*(?:m|mn|million|b|bn|billion)\b/i.test(tail)) return null;
  const second = n2 ? toNumber(n2, k2) : undefined;
  // "$120 - 140k" puts the k on the second figure only.
  const first = toNumber(n1, k1 ?? (k2 && second && Number(n1) < 1000 ? k2 : undefined));
  const lo = Math.min(first, second ?? first);
  const hi = Math.max(first, second ?? first);
  if (!Number.isFinite(lo) || lo <= 0) return null;
  const period = periodFor(text.slice(Math.max(0, at - 40), at), tail, hi);
  if (!period) return null;
  const [floor, ceiling] = BOUNDS[period];
  if (lo < floor || hi > ceiling) return null;
  const currency = code ?? symbolCurrency(cur1) ?? symbolCurrency(cur2) ?? fallbackCurrency;
  return { min: lo, max: hi, currency: currency ?? undefined, period };
}

/**
 * First plausible salary in the text: "$120,000 - $140,000", "$65/hour", "AUD 110k", "150,000 - 180,000 AUD".
 * A bare "$" takes `fallbackCurrency`. Figures without any currency marker are ignored.
 */
// ponytail: regex over the first match with sanity bounds per period. Equity grants and bonuses written
// like salaries can slip through. Upgrade path is an extractor that scores every candidate in context.
export function parseSalary(text: string, fallbackCurrency?: string): ParsedSalary | null {
  for (const m of text.matchAll(RANGE)) {
    const parsed = fromMatch(m, text, fallbackCurrency);
    if (parsed) return parsed;
  }
  return null;
}

const SALARY_LINE = /\b(?:salary|salaries|compensation|remuneration|pay range|base pay|pay rate|package|per annum|hourly rate|day rate|ote|wage)\b/i;

/** Salary stated in an advert body. Only lines that talk about pay are read, to skip funding and revenue figures. */
export function salaryFromDescription(description: string, fallbackCurrency?: string): ParsedSalary | null {
  const lines = description.split("\n").filter((l) => SALARY_LINE.test(l));
  return lines.length ? parseSalary(lines.join("\n"), fallbackCurrency) : null;
}
