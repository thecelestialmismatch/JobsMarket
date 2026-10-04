// HTML to plain text for job adverts. No dependencies, no DOM.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", sbquo: "\u201a", ldquo: "\u201c",
  rdquo: "\u201d", bdquo: "\u201e", hellip: "\u2026", bull: "\u2022", middot: "\u00b7", copy: "\u00a9",
  reg: "\u00ae", trade: "\u2122", deg: "\u00b0", times: "\u00d7", divide: "\u00f7", euro: "\u20ac",
  pound: "\u00a3", yen: "\u00a5", cent: "\u00a2", sect: "\u00a7", para: "\u00b6", laquo: "\u00ab",
  raquo: "\u00bb", shy: "", zwj: "", zwnj: "", eacute: "\u00e9", egrave: "\u00e8", aacute: "\u00e1",
  agrave: "\u00e0", ocirc: "\u00f4", uuml: "\u00fc", ouml: "\u00f6", auml: "\u00e4", ccedil: "\u00e7",
  ntilde: "\u00f1", iexcl: "\u00a1", iquest: "\u00bf",
};

function fromCodePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      return fromCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    const named = NAMED[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

const BLOCK_TAGS = "p|div|h[1-6]|ul|ol|tr|table|thead|tbody|section|article|header|footer|blockquote|pre|hr|dl|dt|dd";

export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse ships markup entity encoded, sometimes twice. Reveal the tags before stripping them.
  for (let i = 0; i < 3 && /&(?:amp;)*lt;\/?[a-z!]/i.test(s) && !/<\/?[a-z!]/i.test(s); i++) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n\u2022 ")
    .replace(/<\/li\s*>/gi, "")
    .replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]*>/g, "");
  s = decodeEntities(s).replace(/\u00a0/g, " ");
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim());
  return lines
    .join("\n")
    .replace(/\u2022\s*(?=\u2022|$)/g, "")
    .replace(/\u2022 *\n\s*(?=\S)/g, "\u2022 ")
    .replace(/^\u2022\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
