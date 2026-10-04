// Word lists that tell a job title from an employer name from a place.
import { classifyTitle } from "@/lib/skills";

// ponytail: keyword lists, not a model. Unusual titles or employers fall back to line order. Grow the lists from real misparses.
const TITLE_RE =
  /\b(?:analyst|engineer|developer|manager|lead|leader|officer|consultant|specialist|co-?ordinator|assistant|administrator|agent|representative|advis[eo]r|supervisor|director|designer|architect|scientist|intern|graduate|technician|associate|executive|head|clerk|operator|trainer|teacher|nurse|accountant|programmer|tester|owner|founder|writer|editor|recruiter|planner|controller|auditor|strategist|producer|researcher|lecturer|tutor|cashier|attendant|mentor|volunteer|apprentice|receptionist|chef|driver|electrician|mechanic|pharmacist|counsell?or|paralegal|lawyer|solicitor|barista|storeperson|labourer|president|cto|ceo|cfo|coo)s?\b/i;
const COMPANY_RE =
  /\b(?:pty|ltd|limited|inc|llc|plc|gmbh|group|corp|corporation|company|bank|university|council|services|solutions|telecom|telecommunications|logistics|analytics|health|healthcare|agency|department|partners|consulting|systems|technologies|technology|labs|studios?|foundation|trust|hospital|school|college|institute|government|holdings|industries|enterprises|ventures|media|energy|insurance|retail|airlines|airways|capital|financial)\b/i;

const AU_STATES = "VIC|NSW|QLD|WA|SA|TAS|ACT|NT|Victoria|New South Wales|Queensland|Western Australia|South Australia|Tasmania";
const COUNTRIES =
  "UK|United Kingdom|England|Scotland|Wales|Ireland|Australia|New Zealand|NZ|USA|US|United States|Canada|India|Singapore|Germany|France|Netherlands|Philippines|Malaysia|South Africa|UAE";
const PLACE = "[A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+){0,2}";
const AU_LOCATION = new RegExp(`^${PLACE},? (?:${AU_STATES})(?: \\d{4})?$`);
const COUNTRY_LOCATION = new RegExp(`^${PLACE}, ?(?:${COUNTRIES})$`);
const REMOTE = /^remote\b[\w ,()-]{0,30}$/i;

export function looksLikeTitle(s: string): boolean {
  return TITLE_RE.test(s) || classifyTitle(s) !== null;
}

export function titleScore(s: string): number {
  return (TITLE_RE.test(s) ? 2 : 0) + (classifyTitle(s) ? 1 : 0) - (COMPANY_RE.test(s) ? 2 : 0);
}

export function companyScore(s: string): number {
  return COMPANY_RE.test(s) ? 1 : 0;
}

/** True when the whole string is a place, e.g. "Melbourne VIC", "Sydney NSW 2000", "London, UK", "Remote". */
export function isLocation(s: string): boolean {
  const t = s.trim();
  return AU_LOCATION.test(t) || COUNTRY_LOCATION.test(t) || REMOTE.test(t);
}
