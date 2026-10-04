import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { CvError, detectFileType, extractText, MAX_UPLOAD_BYTES } from "./extract";

const DIR = path.join(__dirname, "__fixtures__");
const bytes = (f: string) => new Uint8Array(readFileSync(path.join(DIR, f)));

describe("extractText", () => {
  it.each(["jordan-avery.txt", "jordan-avery.docx", "jordan-avery.pdf"])("reads %s", async (f) => {
    const { text } = await extractText(bytes(f));
    expect(text).toContain("Northwind Telecom");
    expect(text).toContain("jordan.avery@example.com");
  });

  it("decides type by magic bytes, never by name", async () => {
    expect(detectFileType(bytes("jordan-avery.pdf"))).toBe("pdf");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectFileType(png)).toBeNull();
    await expect(extractText(png)).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("rejects a zip that is not a Word document", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a docx");
    const data = await zip.generateAsync({ type: "uint8array" });
    await expect(extractText(data)).rejects.toBeInstanceOf(CvError);
  });

  it("rejects oversize, near empty and binary input", async () => {
    await expect(extractText(new Uint8Array(MAX_UPLOAD_BYTES + 1))).rejects.toMatchObject({ code: "too_large" });
    await expect(extractText(new TextEncoder().encode("Hi there"))).rejects.toMatchObject({ code: "empty" });
    const nul = new TextEncoder().encode("a".repeat(200) + "\u0000" + "b".repeat(200));
    expect(detectFileType(nul)).not.toBe("txt");
  });
});
