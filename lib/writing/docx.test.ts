import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { parseCv } from "@/lib/cv/parse";
import { scoreMatch } from "@/lib/match";
import { demoJobs } from "@/lib/store/demo-jobs";
import { generateKitDeterministic } from "./deterministic";
import { renderDocx, renderKitZip } from "./docx";

const NOW = new Date("2026-10-01T00:00:00Z");
const cv = parseCv(readFileSync(path.join(__dirname, "../cv/__fixtures__/jordan-avery.txt"), "utf8"), { now: NOW });
const job = demoJobs(NOW).find((j) => j.id.endsWith("quillfeather-reporting"))!;
const kit = generateKitDeterministic(cv, job, scoreMatch(cv, job, {}, NOW), { now: NOW, id: "k" });

describe("docx output", () => {
  it("produces a single column Word file that round trips headings and bullets", async () => {
    const doc = kit.documents.find((d) => d.kind === "cv")!;
    const bytes = await renderDocx(doc);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("<w:tbl>");
    expect(xml).not.toContain("<w:txbxContent>");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    expect(value).toContain("EXPERIENCE");
    const firstBullet = doc.sections.find((s) => s.style === "bullets")!.items[0].text;
    expect(value).toContain(firstBullet);
  });

  it("zips every document with predictable names", async () => {
    const zip = await JSZip.loadAsync(await renderKitZip(kit, "Jordan_Avery"));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["Jordan_Avery_CV.docx", "Jordan_Avery_Cover_Letter.docx", "Jordan_Avery_Outreach.txt"]));
  });
});
