/**
 * Builds a small uncompressed PDF so the import path can be tested against a real file
 * rather than a mock of the parser. Each page draws its lines with `Td`/`Tj`, which is what
 * a text-layer PDF actually contains.
 */
export function buildTestPdf(pages: string[][], info: Record<string, string> = {}): Uint8Array {
  const encoder = new TextEncoder();
  const objects: string[] = [];
  const pageCount = pages.length;
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const contentObjectIds = pages.map((_, index) => 5 + index * 2);

  const escape = (value: string) => value.replace(/([\\()])/g, "\\$1");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((lines, index) => {
    objects[pageObjectIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`;
    const drawn = lines
      .map((line, lineIndex) => `BT /F1 11 Tf 72 ${720 - lineIndex * 16} Td (${escape(line)}) Tj ET`)
      .join("\n");
    objects[contentObjectIds[index]] = `<< /Length ${drawn.length} >>\nstream\n${drawn}\nendstream`;
  });

  const infoId = 4 + pageCount * 2;
  const infoEntries = Object.entries(info).map(([key, value]) => `/${key} (${escape(value)})`).join(" ");
  if (infoEntries) objects[infoId] = `<< ${infoEntries} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) continue;
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const maxId = objects.length;
  let xref = `xref\n0 ${maxId}\n0000000000 65535 f \n`;
  for (let id = 1; id < maxId; id++) {
    xref += offsets[id] === undefined
      ? "0000000000 65535 f \n"
      : `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${maxId} /Root 1 0 R${infoEntries ? ` /Info ${infoId} 0 R` : ""} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(body + xref + trailer);
}
