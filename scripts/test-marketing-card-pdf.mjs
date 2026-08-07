import assert from "node:assert/strict";
import { buildSingleImagePdfBase64 } from "../components/vendor-marketing-card/nativePdf.ts";

// Valid 1x1 RGB JPEG. Keeping the fixture inline makes this check portable and
// ensures the PDF builder is exercised without filesystem or native modules.
const JPEG_BASE64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==";

const pdfBase64 = buildSingleImagePdfBase64({
  jpegBase64: JPEG_BASE64,
  imageWidth: 3000,
  imageHeight: 2000,
  pageWidthMm: 297,
  pageHeightMm: 198,
});
const pdf = Buffer.from(pdfBase64, "base64");
const source = pdf.toString("latin1");

assert.equal(source.slice(0, 9), "%PDF-1.4\n", "PDF header must identify version 1.4.");
assert.match(source, /\/Type \/Catalog \/Pages 2 0 R/, "PDF must have a catalog and page tree.");
assert.match(source, /\/MediaBox \[0 0 841\.8898 561\.2598\]/, "PDF page must remain exactly 297x198 mm.");
assert.match(source, /\/Subtype \/Image \/Width 3000 \/Height 2000/, "PDF must preserve the native 3000x2000 export resolution.");
assert.match(source, /\/Filter \/DCTDecode/, "Captured JPEG must be embedded without a lossy second conversion.");

const startXrefMatch = /startxref\n(\d+)\n%%EOF\n$/.exec(source);
assert.ok(startXrefMatch, "PDF must end with a startxref pointer and EOF marker.");
const xrefOffset = Number(startXrefMatch[1]);
assert.equal(source.slice(xrefOffset, xrefOffset + 4), "xref", "startxref must point to the xref table.");

const xrefRows = source.slice(xrefOffset).split("\n").slice(2, 8);
assert.equal(xrefRows.length, 6, "xref must contain the free entry and five indirect objects.");
for (let objectNumber = 1; objectNumber <= 5; objectNumber += 1) {
  const declaredOffset = Number(xrefRows[objectNumber].slice(0, 10));
  assert.equal(
    source.slice(declaredOffset, declaredOffset + `${objectNumber} 0 obj`.length),
    `${objectNumber} 0 obj`,
    `xref entry ${objectNumber} must point to object ${objectNumber}.`,
  );
}

const jpeg = Buffer.from(JPEG_BASE64, "base64");
const streamStart = source.indexOf("stream\n", source.indexOf("/Subtype /Image")) + "stream\n".length;
assert.deepEqual(pdf.subarray(streamStart, streamStart + jpeg.length), jpeg, "PDF must contain the captured JPEG bytes unchanged.");

assert.throws(
  () => buildSingleImagePdfBase64({ jpegBase64: "", imageWidth: 1, imageHeight: 1, pageWidthMm: 1, pageHeightMm: 1 }),
  /invalid/,
  "Empty capture data must fail explicitly.",
);
assert.throws(
  () => buildSingleImagePdfBase64({ jpegBase64: Buffer.from("not-jpeg").toString("base64"), imageWidth: 1, imageHeight: 1, pageWidthMm: 1, pageHeightMm: 1 }),
  /not a valid JPEG/,
  "Non-JPEG capture data must fail explicitly.",
);

console.log("Marketing card native PDF tests passed.");
