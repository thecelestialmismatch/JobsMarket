import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import type { DocKind, DraftDocument, DraftSection, GeneratedKit } from "@/lib/types";

// ATS safe Word output: one column, no tables, text boxes, headers, footers or images. Headings are
// plain paragraphs with a size step so screening software reads them as section labels.

const FONT = "Calibri";
const CM = 567; // twips per centimetre

function sectionParagraphs(sec: DraftSection, kind: DocKind): Paragraph[] {
  const out: Paragraph[] = [];
  if (sec.heading) {
    out.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        children: [new TextRun({ text: sec.heading.toUpperCase(), font: FONT, size: 24, bold: true })],
      }),
    );
  }
  if (sec.meta) {
    out.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: sec.meta, font: FONT, size: 22, bold: true })] }));
  }
  if (sec.style === "bullets") {
    for (const it of sec.items) {
      out.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: it.text, font: FONT, size: 22 })] }));
    }
  } else if (sec.style === "lines") {
    sec.items.forEach((it, i) => {
      const isName = kind !== "outreach" && !sec.heading && i === 0 && (kind === "cv" || kind === "portfolio");
      out.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 60 },
          children: [new TextRun({ text: it.text, font: FONT, size: isName ? 32 : 22, bold: isName })],
        }),
      );
    });
  } else {
    out.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: sec.items.map((i) => i.text).join(" "), font: FONT, size: 22 })] }));
  }
  return out;
}

export async function renderDocx(doc: DraftDocument): Promise<Uint8Array> {
  const file = new Document({
    creator: "",
    title: doc.title,
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 2 * CM, bottom: 2 * CM, left: 2 * CM, right: 2 * CM } } },
        children: doc.sections.flatMap((sec) => sectionParagraphs(sec, doc.kind)),
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(file));
}

/** Plain text for preview, copy and the .txt exports. */
export function renderText(doc: DraftDocument): string {
  return doc.sections
    .map((sec) => {
      const lines: string[] = [];
      if (sec.heading) lines.push(sec.heading.toUpperCase());
      if (sec.meta) lines.push(sec.meta);
      if (sec.style === "bullets") lines.push(...sec.items.map((i) => `• ${i.text}`));
      else if (sec.style === "lines") lines.push(...sec.items.map((i) => i.text));
      else lines.push(sec.items.map((i) => i.text).join(" "));
      return lines.join("\n");
    })
    .join("\n\n")
    .trim();
}

const FILE: Record<DocKind, [string, "docx" | "txt"]> = {
  cv: ["CV", "docx"],
  cover_letter: ["Cover_Letter", "docx"],
  portfolio: ["Portfolio", "docx"],
  outreach: ["Outreach", "txt"],
  linkedin: ["LinkedIn", "txt"],
  interview_prep: ["Interview_Prep", "docx"],
};

export async function renderKitZip(kit: GeneratedKit, baseName: string): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const doc of kit.documents) {
    const [name, ext] = FILE[doc.kind];
    zip.file(`${baseName}_${name}.${ext}`, ext === "docx" ? await renderDocx(doc) : `${renderText(doc)}\n`);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
