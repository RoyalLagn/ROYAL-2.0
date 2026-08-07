const POINTS_PER_MM = 72 / 25.4;

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * Wrap a captured RGB JPEG in a standards-compliant, single-page PDF.
 * Keeping this native-only avoids shipping browser DOM dependencies through
 * Metro merely to place one full-page image in a document.
 */
export function buildSingleImagePdfBase64({
  jpegBase64,
  imageWidth,
  imageHeight,
  pageWidthMm,
  pageHeightMm,
}: {
  jpegBase64: string;
  imageWidth: number;
  imageHeight: number;
  pageWidthMm: number;
  pageHeightMm: number;
}): string {
  if (!jpegBase64 || imageWidth <= 0 || imageHeight <= 0 || pageWidthMm <= 0 || pageHeightMm <= 0) {
    throw new Error("The captured marketing card image is invalid.");
  }

  const jpegBytes = base64ToBytes(jpegBase64);
  if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    throw new Error("The captured marketing card is not a valid JPEG image.");
  }

  const pageWidth = (pageWidthMm * POINTS_PER_MM).toFixed(4);
  const pageHeight = (pageHeightMm * POINTS_PER_MM).toFixed(4);
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const parts: Uint8Array[] = [asciiBytes("%PDF-1.4\n")];
  const offsets = [0];

  const appendObject = (objectNumber: number, bodyParts: Uint8Array[]) => {
    offsets[objectNumber] = parts.reduce((sum, part) => sum + part.length, 0);
    parts.push(asciiBytes(`${objectNumber} 0 obj\n`), ...bodyParts, asciiBytes("\nendobj\n"));
  };

  appendObject(1, [asciiBytes("<< /Type /Catalog /Pages 2 0 R >>")]);
  appendObject(2, [asciiBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")]);
  appendObject(3, [asciiBytes(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
    "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
  )]);
  appendObject(4, [
    asciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    ),
    jpegBytes,
    asciiBytes("\nendstream"),
  ]);
  appendObject(5, [asciiBytes(`<< /Length ${content.length} >>\nstream\n${content}endstream`)]);

  const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const xrefEntries = ["0000000000 65535 f \n"];
  for (let objectNumber = 1; objectNumber <= 5; objectNumber += 1) {
    xrefEntries.push(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(asciiBytes(
    `xref\n0 6\n${xrefEntries.join("")}trailer\n<< /Size 6 /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ));

  return bytesToBase64(joinBytes(parts));
}
