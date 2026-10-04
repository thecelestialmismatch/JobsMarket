// Contact details. The header block (text above the first heading) is searched first so that a
// referee's phone number further down never wins.
import type { ParsedCV } from "@/lib/types";
import { detectHeading } from "./sections";
import { isBulletLine } from "./normalise";
import { isLocation, looksLikeTitle } from "./lexicon";

export type Contact = ParsedCV["contact"];

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE_RES = [
  /(?<![\d+])(?:\+61\s?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/,
  /(?<![\d+])(?:\+61\s?[2378]|\(0[2378]\)|0[2378])[\s-]?\d{4}[\s-]?\d{4}(?!\d)/,
  /(?<!\d)1[38]00[\s-]?\d{3}[\s-]?\d{3}(?!\d)/,
  /\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/,
];
const PROFILE_LINK = /^(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|github\.com)\/[\w.-]+\/?$/i;
const SCHEME_LINK = /^(?:https?:\/\/|www\.)[\w.-]+\.[a-z]{2,}(?:\/[\w./%#?=&-]*)?$/i;
const BARE_SITE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|me|au|app|site|co|xyz|tech|page)(?:\/[\w./-]*)?$/i;
const NOT_A_NAME = /^(?:curriculum vitae|resume|cv)$/i;
const NAME_WORD = /^(?:[A-Z][a-zA-Z'-]*\.?|[A-Z'-]+|van|von|de|da|del|der|bin|al|le)$/;

function tokens(text: string): string[] {
  return text
    .split(/[\s|,;<>()[\]]+/)
    .map((t) => t.replace(/^mailto:/i, "").replace(/[.:]+$/, ""))
    .filter(Boolean);
}

function findEmail(text: string): string | undefined {
  return tokens(text).find((t) => EMAIL_RE.test(t));
}

function findPhone(text: string): string | undefined {
  const hits = PHONE_RES.map((re) => re.exec(text))
    .filter((m): m is RegExpExecArray => m !== null)
    .filter((m) => {
      const digits = m[0].replace(/\D/g, "").length;
      return digits >= 8 && digits <= 15;
    })
    .sort((a, b) => a.index - b.index);
  return hits[0]?.[0].replace(/\s+/g, " ").trim();
}

function findLinks(text: string, allowBareSites: boolean): string[] {
  return tokens(text).filter(
    (t) => !t.includes("@") && (PROFILE_LINK.test(t) || SCHEME_LINK.test(t) || (allowBareSites && BARE_SITE.test(t))),
  );
}

function chunks(lines: string[]): string[] {
  return lines.flatMap((l) => l.split(/\s*[|\t]\s*/)).map((c) => c.trim()).filter(Boolean);
}

function titleCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

function findName(headerLines: string[]): string | undefined {
  for (const line of headerLines.slice(0, 6)) {
    if (isBulletLine(line) || /[\d@/|\t:,]/.test(line)) continue;
    if (isLocation(line) || looksLikeTitle(line) || detectHeading(line) || NOT_A_NAME.test(line)) continue;
    const words = line.trim().split(" ");
    if (words.length < 2 || words.length > 4 || !words.every((w) => NAME_WORD.test(w))) continue;
    const allCaps = line === line.toUpperCase();
    return allCaps ? words.map(titleCase).join(" ") : line.trim();
  }
  return undefined;
}

/**
 * @param headerLines normalised lines above the first section heading
 * @param bodyText the rest of the CV with the references section already removed
 */
export function extractContact(headerLines: string[], bodyText: string): Contact {
  const headerText = headerLines.join("\n");
  const links = [...new Set([...findLinks(headerText, true), ...findLinks(bodyText, false)])];
  return {
    name: findName(headerLines),
    email: findEmail(headerText) ?? findEmail(bodyText),
    phone: findPhone(headerText) ?? findPhone(bodyText),
    location: chunks(headerLines).find(isLocation),
    links,
  };
}
