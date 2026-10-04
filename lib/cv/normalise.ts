// Text clean up shared by every CV parser stage. After normaliseText a bullet line always starts
// with "- " and a wide gap (tab or 3+ spaces) is a single tab.

const LEADING_BULLET = /^[\u2022\u25aa\u25e6\u25cf\u00b7\u2023\u2043\u25a0\u25a1\u25ba\u25b8\u27a2\u2713\u2714*]\s*/;
const LEADING_DASH = /^-\s*(?=\S)/;
const INLINE_SEPARATOR = /\s[\u2022\u00b7\u25aa\u25cf\u25e6]\s/g;
const DASHES = /[\u2010-\u2015\u2212]/g;
const ODD_SPACES = /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g;
const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/g;
const RULE_LINE = /^[-_=~*.]{3,}$/;
const CONNECTOR_END = /(?:,|&|\b(?:and|or|of|the|to|in|for|with|a|an|by|on|at|from|into|across))$/i;

function normaliseLine(line: string): string {
  const trimmed = line.replace(/[ \t]+$/, "").replace(/^[ \t]+/, "");
  if (RULE_LINE.test(trimmed)) return "";
  const bulleted = trimmed.replace(LEADING_BULLET, "- ").replace(LEADING_DASH, "- ").trimEnd();
  if (bulleted === "-") return "";
  return bulleted
    .replace(INLINE_SEPARATOR, " | ")
    .replace(/\t+| {3,}/g, "\t")
    .replace(/ {2}/g, " ");
}

export function normaliseText(raw: string): string {
  const lines = raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(ODD_SPACES, " ")
    .replace(ZERO_WIDTH, "")
    .replace(DASHES, "-")
    .split("\n")
    .map(normaliseLine);
  return lines
    .join("\n")
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isBulletLine(line: string): boolean {
  return line.startsWith("- ");
}

export function stripBullet(line: string): string {
  return (isBulletLine(line) ? line.slice(2) : line).replace(/\t/g, " ").trim();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** A line that reads as content (bullet or sentence) rather than a role, company or title heading. */
export function isBodyLine(line: string): boolean {
  if (isBulletLine(line)) return true;
  const words = countWords(line);
  if (words >= 12) return true;
  return words >= 5 && /[.!?]$/.test(line) && !/\b(?:ltd|inc|corp|co|pty|llc|plc)\.$/i.test(line);
}

/**
 * Rejoins lines that a PDF or a narrow column wrapped. A line continues the previous one when the
 * previous line is unfinished and this one starts lower case, or the previous ends on a connector.
 * `keep` lets the caller protect lines (such as date lines) that must never be merged.
 */
export function joinContinuations(lines: string[], keep: (line: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const continues =
      prev !== undefined &&
      !isBulletLine(line) &&
      !keep(line) &&
      !/[.!?:]$/.test(prev) &&
      (/^[a-z]/.test(line) || CONNECTOR_END.test(prev));
    if (continues) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}
