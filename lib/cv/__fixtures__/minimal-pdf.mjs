// Hand written single font PDF, used as the Chrome fallback and by the extract tests.
// Text is WinAnsi encoded Helvetica, so the bullet glyph maps to byte 0x95.

const LINES_PER_PAGE = 60;

function escapePdfText(line) {
  let out = "";
  for (const ch of line) {
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (ch === "\u2022") out += "\\225";
    else if (ch.charCodeAt(0) < 128) out += ch;
    else out += "?";
  }
  return out;
}

function pageStream(lines) {
  const body = lines.map((l) => `(${escapePdfText(l)}) Tj T*`).join("\n");
  return `BT /F1 10 Tf 14 TL 50 790 Td\n${body}\nET`;
}

/**
 * @param {string[]} lines
 * @param {{ encrypt?: boolean }} [opts] encrypt adds a Standard security handler with an unknown user password
 * @returns {Uint8Array}
 */
export function buildMinimalPdf(lines, opts = {}) {
  const pages = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));

  const objects = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((pageLines, i) => {
    const stream = pageStream(pageLines);
    objects[pageIds[i]] =
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> " +
      `/Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const encryptId = objects.length;
  if (opts.encrypt) {
    const hex32 = "A1".repeat(32);
    objects[encryptId] = `<< /Filter /Standard /V 1 /R 2 /O <${hex32}> /U <${"B2".repeat(32)}> /P -4 >>`;
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  const encryptRef = opts.encrypt ? ` /Encrypt ${encryptId} 0 R /ID [<${"C3".repeat(16)}> <${"C3".repeat(16)}>]` : "";
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R${encryptRef} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}
