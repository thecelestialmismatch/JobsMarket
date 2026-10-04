import type { RemoteMode } from "@/lib/types";

interface CountryRule {
  code: string;
  words: string[]; // lower case, matched on word boundaries
  abbr?: RegExp; // case sensitive abbreviations
}

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
  "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];

// ponytail: word lists cover the markets we ingest (AU, NZ, UK, US, CA, SG, IN). Other countries return
// undefined. WA is left out of the US abbreviations because it also means Western Australia.
const RULES: CountryRule[] = [
  {
    code: "AU",
    words: [
      "australia", "anz", "new south wales", "victoria", "queensland", "tasmania", "northern territory",
      "australian capital territory", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra",
      "hobart", "darwin", "gold coast", "sunshine coast", "geelong", "parramatta", "wollongong",
    ],
    abbr: /\b(?:NSW|VIC|QLD|TAS|ACT)\b/,
  },
  { code: "NZ", words: ["new zealand", "aotearoa", "auckland", "wellington", "christchurch", "dunedin"] },
  {
    code: "GB",
    words: [
      "united kingdom", "uk", "u\\.k\\.", "great britain", "england", "scotland", "northern ireland", "london",
      "manchester", "edinburgh", "glasgow", "bristol", "leeds", "cardiff", "belfast",
    ],
  },
  {
    code: "US",
    words: [
      "united states", "usa", "us", "u\\.s\\.", "new york", "nyc", "san francisco", "seattle", "austin", "chicago",
      "boston", "los angeles", "denver", "atlanta", "miami", "dallas", "houston", "san diego", "san jose",
      "palo alto", "san mateo", "pittsburgh", "philadelphia", "d\\.c\\.", ...US_STATES,
    ],
    abbr: /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WV|WI|WY|DC)\b/,
  },
  {
    code: "CA",
    words: ["canada", "toronto", "vancouver", "montreal", "calgary", "ottawa", "edmonton", "waterloo", "ontario", "british columbia", "quebec", "alberta"],
    abbr: /,\s*(?:ON|BC|QC|AB|MB|NS|SK|NB)\b/,
  },
  { code: "SG", words: ["singapore"] },
  {
    code: "IN",
    words: ["india", "bangalore", "bengaluru", "mumbai", "new delhi", "delhi", "hyderabad", "pune", "chennai", "gurgaon", "gurugram", "noida", "kolkata"],
  },
];

const MATCHERS = RULES.map((r) => ({
  code: r.code,
  word: new RegExp(`(?:^|[^a-z])(?:${r.words.join("|")})(?![a-z])`, "gi"),
  abbr: r.abbr ? new RegExp(r.abbr.source, "g") : undefined,
}));

const LEADING_CODE: Record<string, string> = {
  AU: "AU", NZ: "NZ", UK: "GB", GB: "GB", US: "US", USA: "US", CA: "CA", CAN: "CA", SG: "SG", IN: "IN", IND: "IN",
};

interface Hit {
  code: string;
  end: number;
}

function lastHit(re: RegExp, text: string): { end: number; token: string } | undefined {
  let hit: { end: number; token: string } | undefined;
  for (const m of text.matchAll(re)) hit = { end: (m.index ?? 0) + m[0].length, token: m[0] };
  return hit;
}

function inferSegment(segment: string): string | undefined {
  // "AU - HQ - NSW", "AU: Sydney (45 Example St)", "CA - Toronto" style prefixes are explicit codes.
  const lead = /^\s*([A-Z]{2,3})\s*[-:]\s/.exec(segment);
  if (lead && LEADING_CODE[lead[1]]) return LEADING_CODE[lead[1]];
  const words: Hit[] = [];
  const abbrs: (Hit & { token: string })[] = [];
  for (const m of MATCHERS) {
    const word = lastHit(m.word, segment);
    if (word) words.push({ code: m.code, end: word.end });
    const abbr = m.abbr ? lastHit(m.abbr, segment) : undefined;
    if (abbr) abbrs.push({ code: m.code, end: abbr.end, token: abbr.token.replace(/[^A-Z]/g, "") });
  }
  // "Toronto, CA" and "Bengaluru, IN" end in the country code itself, not a US state abbreviation.
  const confirmed = abbrs.find((a) => words.some((w) => w.code === a.token));
  if (confirmed) return confirmed.token;
  // "City, State, Country" reads most general last, so the match that ends latest wins.
  return [...words, ...abbrs].reduce<Hit | undefined>((best, h) => (!best || h.end > best.end ? h : best), undefined)?.code;
}

const FILLER = /\b(?:or|and|based|in|only|hq|city|greater|area|metro|remote|hybrid|on-?site|in[- ]office|anywhere|wfh|work from home|flexible|au|nz)\b/gi;

/** True when the text names only places and work modes, e.g. "Sydney, NSW" or "Remote, US", not "US Payments". */
export function isPlaceOnly(text: string): boolean {
  if (!/[a-z]/i.test(text)) return false;
  let rest = text;
  for (const m of MATCHERS) {
    rest = rest.replace(m.word, " ");
    if (m.abbr) rest = rest.replace(m.abbr, " ");
  }
  return rest.replace(FILLER, " ").replace(/[\s,.&/()+|:\-\u2013\u2014]+/g, "").length === 0;
}

/**
 * ISO 3166-1 alpha-2 country for a free text location, or undefined. Multi location strings
 * ("Remote, Canada; Remote, US", "Australia or New Zealand") resolve to the first segment that names a known country.
 */
export function inferCountry(location: string | null | undefined): string | undefined {
  if (!location) return undefined;
  for (const segment of location.split(/;|\||\s\/\s|\n|\s+or\s+/i)) {
    const code = inferSegment(segment);
    if (code) return code;
  }
  return undefined;
}

const WORKPLACE: Record<string, RemoteMode> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  inoffice: "onsite",
  office: "onsite",
};

export function detectRemote(input: {
  workplace?: string | null;
  isRemote?: boolean | null;
  title: string;
  location: string;
}): RemoteMode {
  const structured = input.workplace ? WORKPLACE[input.workplace.toLowerCase().replace(/[^a-z]/g, "")] : undefined;
  if (structured) return structured;
  if (input.isRemote) return "remote";
  const text = `${input.title} ${input.location}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\b(?:remote|work from home|wfh|anywhere|distributed)\b/.test(text)) return "remote";
  if (/\b(?:on-?site|in[- ]office|office based)\b/.test(text)) return "onsite";
  return "unknown";
}
