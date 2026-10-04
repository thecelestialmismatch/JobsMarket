import type { CandidatePrefs, Criterion, JobFeatures, ParsedCV } from "@/lib/types";
import { criterion } from "./rubric";

// ponytail: small gazetteer of countries, states and major cities, most specific first.
// Upgrade to a geocoding table when adverts outside these markets matter.
const COUNTRY_HINTS: [RegExp, string][] = [
  [/new south wales|western australia|south australia|northern territory/, "AU"],
  [/\baustralia\b/, "AU"],
  [/new zealand|aotearoa/, "NZ"],
  [/united kingdom|\bengland\b|\bscotland\b|\bwales\b|\bu\.?k\.?\b/, "GB"],
  [/united states|\bu\.?s\.?a\.?\b/, "US"],
  [/\bcanada\b/, "CA"],
  [/\bsingapore\b/, "SG"],
  [/\bireland\b/, "IE"],
  [/\bindia\b/, "IN"],
  [/\bgermany\b/, "DE"],
  [/sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|gold coast|geelong|parramatta/, "AU"],
  [/auckland|wellington|christchurch/, "NZ"],
  [/london|manchester|birmingham|edinburgh|glasgow|leeds|bristol/, "GB"],
  [/new york|san francisco|seattle|austin|boston|chicago|los angeles/, "US"],
  [/toronto|vancouver|montreal/, "CA"],
  [/dublin/, "IE"],
  [/bangalore|bengaluru|mumbai|delhi|hyderabad|pune/, "IN"],
  [/berlin|munich|hamburg/, "DE"],
  [/victoria|queensland|tasmania|\b(?:vic|nsw|qld|tas|act)\b/, "AU"],
];

const REGION_WORDS =
  /new south wales|western australia|south australia|northern territory|australia|new zealand|aotearoa|united kingdom|united states|victoria|queensland|tasmania/g;
const NON_CITY = new Set([
  "remote", "hybrid", "onsite", "site", "office", "based", "cbd", "metro", "area", "region", "greater", "anywhere",
  "flexible", "within", "city", "and", "the", "vic", "nsw", "qld", "tas", "act", "england", "scotland", "wales",
  "canada", "singapore", "ireland", "india", "germany", "usa", "work", "from", "home", "any", "location",
]);

function isoCode(value: string | undefined): string | null {
  const v = value?.trim().toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) ? (v === "UK" ? "GB" : v) : null;
}

export function inferCountry(location: string): string | null {
  const direct = isoCode(location);
  if (direct) return direct;
  const text = location.toLowerCase();
  return COUNTRY_HINTS.find(([re]) => re.test(text))?.[1] ?? null;
}

export function cityTokens(location: string): string[] {
  return location
    .toLowerCase()
    .replace(REGION_WORDS, " ")
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !NON_CITY.has(t));
}

function missingLocation(): Criterion {
  return criterion(
    "location",
    "missing",
    0,
    "No evidence was found for your location. State your city and country on the CV so location can be scored.",
  );
}

export function locationCriterion(cv: ParsedCV, job: JobFeatures, prefs?: CandidatePrefs): Criterion {
  if (job.remote === "remote") return criterion("location", "met", 1, "The role is remote, so location is not a barrier.");
  if (prefs?.remoteOnly && job.remote === "onsite") {
    return criterion("location", "missing", 0, "You asked for remote roles only and this role is on site.");
  }
  const jobCountry = isoCode(job.country) ?? inferCountry(job.location);
  const jobCities = cityTokens(job.location);
  if (!jobCountry && !jobCities.length) {
    return criterion("location", "not_applicable", 0, "The advert does not state a usable location.");
  }
  const candText = prefs?.location?.trim() || cv.contact.location?.trim() || "";
  const candCountry = isoCode(prefs?.country) ?? (candText ? inferCountry(candText) : null);
  if (!candText && !candCountry) return missingLocation();
  const candCities = cityTokens(candText);
  const conflict = !!candCountry && !!jobCountry && candCountry !== jobCountry;
  if (conflict) return criterion("location", "missing", 0, "Your location is in a different country from the role.");
  if (jobCities.some((t) => candCities.includes(t))) {
    return criterion("location", "met", 1, "Your location matches the role location.");
  }
  if (candCountry && candCountry === jobCountry) {
    if (!jobCities.length) return criterion("location", "met", 1, "Your location is in the country the role is based in.");
    return criterion("location", "partial", 0.5, "Your location is in the same country but a different city.");
  }
  return criterion("location", "missing", 0, "Your stated location does not match the role location.");
}
