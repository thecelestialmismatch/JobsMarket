// Turns an uploaded CV file into plain text. The file type is decided by its bytes, never by the
// file name or the MIME type the client sent.
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import { MAX_TEXT_CHARS, MAX_UPLOAD_BYTES } from "./limits";

export { MAX_TEXT_CHARS, MAX_UPLOAD_BYTES };

export type CvFileType = "pdf" | "docx" | "txt";
export type CvErrorCode = "too_large" | "unsupported_type" | "empty" | "unreadable" | "encrypted";

const MIN_TEXT_CHARS = 80;
const MAX_CONTROL_SHARE = 0.05;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const ZIP_END_RECORD = 0x06054b50;
const ZIP_CENTRAL_ENTRY = 0x02014b50;
const DOCX_PART = "word/document.xml";

const MESSAGES: Record<CvErrorCode, string> = {
  too_large: "This file is larger than 4 MB. Upload a smaller PDF, DOCX or TXT file.",
  unsupported_type: "This file type is not supported. Upload your CV as a PDF, DOCX or TXT file.",
  empty: "We could not find enough text in this file. Upload a text based PDF or DOCX rather than a scanned image.",
  unreadable: "We could not read this file. Save it again as a PDF or DOCX and upload it once more.",
  encrypted: "This PDF is password protected. Remove the password and upload it again.",
};

export class CvError extends Error {
  readonly code: CvErrorCode;

  constructor(code: CvErrorCode, options?: { cause?: unknown }) {
    super(MESSAGES[code], options);
    this.name = "CvError";
    this.code = code;
  }
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

function findZipEnd(view: DataView): number {
  const floor = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === ZIP_END_RECORD) return i;
  }
  return -1;
}

/** Walks the zip central directory for an entry name without inflating anything. Malformed zips give false. */
function zipHasEntry(bytes: Uint8Array, name: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findZipEnd(view);
  if (end < 0) return false;
  const decoder = new TextDecoder();
  let at = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0; i--) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== ZIP_CENTRAL_ENTRY) return false;
    const nameLength = view.getUint16(at + 28, true);
    if (at + 46 + nameLength > bytes.length) return false;
    if (decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)) === name) return true;
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return false;
}

function isControl(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c === 9 || c === 10 || c === 13) return false;
  return c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xfffd;
}

/** Strict UTF-8 text with no NUL bytes and almost no control characters, or null. */
function decodeText(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (err) {
    if (err instanceof TypeError) return null;
    throw err;
  }
  const controls = Array.from(text).filter(isControl).length;
  return controls / Math.max(text.length, 1) <= MAX_CONTROL_SHARE ? text : null;
}

export function detectFileType(bytes: Uint8Array): CvFileType | null {
  if (startsWith(bytes, PDF_MAGIC)) return "pdf";
  if (startsWith(bytes, ZIP_MAGIC)) return zipHasEntry(bytes, DOCX_PART) ? "docx" : null;
  return decodeText(bytes) === null ? null : "txt";
}

function isPasswordError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "PasswordException";
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js detaches the buffer it is given, so it gets a copy and the caller's bytes stay intact.
    doc = await getDocumentProxy(bytes.slice(), { verbosity: 0 });
  } catch (err) {
    throw new CvError(isPasswordError(err) ? "encrypted" : "unreadable", { cause: err });
  }
  try {
    return (await extractPdfText(doc, { mergePages: true })).text;
  } catch (err) {
    throw new CvError("unreadable", { cause: err });
  } finally {
    await doc.cleanup().catch(() => undefined);
  }
}

async function readDocx(bytes: Uint8Array): Promise<string> {
  let hasDocument: boolean;
  try {
    hasDocument = (await JSZip.loadAsync(bytes)).file(DOCX_PART) !== null;
  } catch (err) {
    throw new CvError("unreadable", { cause: err });
  }
  if (!hasDocument) throw new CvError("unsupported_type");
  try {
    return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } catch (err) {
    throw new CvError("unreadable", { cause: err });
  }
}

function readTxt(bytes: Uint8Array): string {
  const text = decodeText(bytes);
  if (text === null) throw new CvError("unreadable");
  return text;
}

async function readByType(bytes: Uint8Array, type: CvFileType): Promise<string> {
  if (type === "pdf") return readPdf(bytes);
  if (type === "docx") return readDocx(bytes);
  return readTxt(bytes);
}

export async function extractText(bytes: Uint8Array): Promise<{ text: string; type: CvFileType }> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new CvError("too_large");
  if (bytes.byteLength === 0) throw new CvError("empty");
  const type = detectFileType(bytes);
  if (type === null) throw new CvError("unsupported_type");
  const text = (await readByType(bytes, type)).slice(0, MAX_TEXT_CHARS);
  if (text.replace(/\s+/g, "").length < MIN_TEXT_CHARS) throw new CvError("empty");
  return { text, type };
}
