import { isPlaceOnly } from "./location";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const GENDER = /\s*[([]?\s*\b(?:[mwfdhx]\s*\/\s*){1,2}[mwfdhx]\b\s*[)\]]?|\s*\(\s*all genders?\s*\)/gi;

function stripCompany(title: string, company: string): string {
  const name = company.trim();
  if (!name) return title;
  const c = escapeRe(name);
  // Only remove the name when a separator attaches it, so "Deputy Manager" at Deputy survives.
  return title
    .replace(new RegExp(`^\\s*${c}\\s*(?:[-|:\u2013\u2014]|\\s-\\s)\\s*`, "i"), "")
    .replace(new RegExp(`\\s*(?:[-|\u2013\u2014]|\\bat\\b|@)\\s*${c}\\s*$`, "i"), "")
    .replace(new RegExp(`\\s*[([]\\s*${c}\\s*[)\\]]`, "gi"), "");
}

function stripLocationTail(title: string): string {
  let out = title;
  for (let i = 0; i < 3; i++) {
    const paren = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(out);
    if (paren && isPlaceOnly(paren[1])) {
      out = out.slice(0, paren.index);
      continue;
    }
    const dash = /\s+[-|\u2013\u2014]\s+([^-|\u2013\u2014]+)$/.exec(out) ?? /\s*,\s*([^,]+)$/.exec(out);
    if (dash && isPlaceOnly(dash[1])) {
      out = out.slice(0, dash.index);
      continue;
    }
    break;
  }
  return out;
}

/**
 * Title without the employer name, gender markers ("(m/f/d)") or trailing location and work mode
 * fragments (" - Sydney", "(Remote)"). En and em dashes become plain hyphens.
 */
export function cleanTitle(title: string, company: string): string {
  const cleaned = stripLocationTail(stripCompany(title.replace(GENDER, " "), company))
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-|,:]+|[\s\-|,:]+$/g, "")
    .trim();
  return cleaned || title.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}
