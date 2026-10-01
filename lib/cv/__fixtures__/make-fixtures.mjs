// Builds jordan-avery.docx and jordan-avery.pdf from jordan-avery.txt.
// Run once from the repo root with `node lib/cv/__fixtures__/make-fixtures.mjs` and commit the binaries.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph } from "docx";
import { buildMinimalPdf } from "./minimal-pdf.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const lines = readFileSync(join(HERE, "jordan-avery.txt"), "utf8").split("\n").map((l) => l.trimEnd());

const isHeading = (l) => l.length > 0 && l === l.toUpperCase() && /[A-Z]/.test(l) && !/\d/.test(l);
const isBullet = (l) => l.startsWith("\u2022 ");

async function buildDocx() {
  const children = lines
    .filter((l) => l.length > 0)
    .map((l) => {
      if (isHeading(l)) return new Paragraph({ text: l, heading: HeadingLevel.HEADING_2 });
      if (isBullet(l)) return new Paragraph({ text: l.slice(2), numbering: { reference: "cv-bullets", level: 0 } });
      return new Paragraph({ text: l });
    });
  const doc = new Document({
    creator: "JobsMarket fixtures",
    numbering: {
      config: [
        {
          reference: "cv-bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [{ children }],
  });
  writeFileSync(join(HERE, "jordan-avery.docx"), await Packer.toBuffer(doc));
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHtml() {
  const out = [];
  let inList = false;
  for (const l of lines) {
    if (isBullet(l)) {
      if (!inList) out.push("<ul>");
      inList = true;
      out.push(`<li>${escapeHtml(l.slice(2))}</li>`);
      continue;
    }
    if (inList) out.push("</ul>");
    inList = false;
    if (l.length === 0) continue;
    out.push(isHeading(l) ? `<h2>${escapeHtml(l)}</h2>` : `<p>${escapeHtml(l)}</p>`);
  }
  if (inList) out.push("</ul>");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Helvetica,Arial,sans-serif;font-size:10pt;margin:0}h2{font-size:12pt;margin:12pt 0 4pt}
p{margin:0 0 2pt}ul{margin:0 0 4pt;padding-left:16pt}
</style></head><body>${out.join("\n")}</body></html>`;
}

function buildPdf() {
  const target = join(HERE, "jordan-avery.pdf");
  rmSync(target, { force: true });
  if (existsSync(CHROME)) {
    const dir = mkdtempSync(join(tmpdir(), "cv-fixture-"));
    try {
      const html = join(dir, "jordan-avery.html");
      writeFileSync(html, toHtml());
      execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${target}`, `file://${html}`], {
        stdio: "ignore",
        timeout: 60000,
      });
      if (existsSync(target)) return "chrome";
    } catch (err) {
      console.warn(`Chrome print failed, using the hand written PDF. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  writeFileSync(target, buildMinimalPdf(lines));
  return "minimal";
}

await buildDocx();
console.log(`docx written, pdf written via ${buildPdf()}`);
