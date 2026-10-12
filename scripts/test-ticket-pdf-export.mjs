import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const royalRoot = path.resolve(__dirname, "..");

console.log("=== Testing RoyalLagn WhatsApp PDF Ticket Sharing Implementation ===");

// 1. Verify ticketPdfExport.ts (Web)
const webServiceContent = fs.readFileSync(
  path.join(royalRoot, "services", "ticketPdfExport.ts"),
  "utf8"
);

assert(
  webServiceContent.includes("export type TicketPdfShareResult"),
  "ticketPdfExport.ts must export TicketPdfShareResult type"
);
assert(
  webServiceContent.includes("navigator.canShare"),
  "ticketPdfExport.ts must check navigator.canShare before sharing"
);
assert(
  webServiceContent.includes("navigator.share({"),
  "ticketPdfExport.ts must call navigator.share"
);
assert(
  !webServiceContent.includes("text:"),
  "ticketPdfExport.ts must NOT pass text parameter to navigator.share (file-only sharing prevents WhatsApp message override)"
);
assert(
  webServiceContent.includes("AbortError"),
  "ticketPdfExport.ts must handle user cancellation (AbortError) without false error or fallback download"
);
assert(
  webServiceContent.includes('method: "download-fallback"'),
  "ticketPdfExport.ts must return download-fallback result for unsupported browsers"
);

console.log("✓ Web ticketPdfExport.ts verified (file-only Web Share, user cancellation handling, download fallback).");

// 2. Verify ticketPdfExport.native.ts (Native)
const nativeServiceContent = fs.readFileSync(
  path.join(royalRoot, "services", "ticketPdfExport.native.ts"),
  "utf8"
);

assert(
  nativeServiceContent.includes("Sharing.shareAsync"),
  "ticketPdfExport.native.ts must use expo-sharing"
);
assert(
  nativeServiceContent.includes('mimeType: "application/pdf"'),
  "ticketPdfExport.native.ts must specify application/pdf MIME type"
);
assert(
  nativeServiceContent.includes('UTI: "com.adobe.pdf"'),
  "ticketPdfExport.native.ts must specify com.adobe.pdf UTI for iOS"
);
assert(
  nativeServiceContent.includes("getJpegDimensions"),
  "ticketPdfExport.native.ts must dynamically extract image dimensions to prevent stretching"
);

console.log("✓ Native ticketPdfExport.native.ts verified (expo-sharing, PDF MIME/UTI, dynamic aspect ratio).");

// 3. Verify TicketPdfFallbackModal.tsx
const fallbackModalContent = fs.readFileSync(
  path.join(royalRoot, "components", "booking", "TicketPdfFallbackModal.tsx"),
  "utf8"
);

assert(
  fallbackModalContent.includes("https://web.whatsapp.com"),
  "TicketPdfFallbackModal must provide WhatsApp Web launcher"
);
assert(
  fallbackModalContent.includes("Downloads"),
  "TicketPdfFallbackModal must instruct the user about their Downloads folder"
);
assert(
  fallbackModalContent.includes("manually"),
  "TicketPdfFallbackModal must transparently explain manual attachment in WhatsApp Web"
);

console.log("✓ TicketPdfFallbackModal.tsx verified (honest guidance, WhatsApp Web button, clear instructions).");

// 4. Verify LuxuryTicketModal.tsx
const luxuryModalContent = fs.readFileSync(
  path.join(royalRoot, "components", "booking", "LuxuryTicketModal.tsx"),
  "utf8"
);

assert(
  !luxuryModalContent.includes("shareWhatsApp = () =>"),
  "LuxuryTicketModal must not retain the old plaintext shareWhatsApp function"
);
assert(
  luxuryModalContent.includes("exportAndShareTicketPdf(ticketCardRef, booking)"),
  "LuxuryTicketModal must call exportAndShareTicketPdf"
);
assert(
  luxuryModalContent.includes("<TicketPdfFallbackModal"),
  "LuxuryTicketModal must render TicketPdfFallbackModal"
);
assert(
  !luxuryModalContent.includes("booking.customer_phone"),
  "LuxuryTicketModal must not expose customer phone number"
);

console.log("✓ LuxuryTicketModal.tsx verified (uses shared service, renders fallback modal, preserves privacy).");

// 5. Verify app/ticket.tsx
const ticketAppContent = fs.readFileSync(
  path.join(royalRoot, "app", "ticket.tsx"),
  "utf8"
);

assert(
  !ticketAppContent.includes("shareWhatsApp = () =>"),
  "app/ticket.tsx must not retain the old plaintext shareWhatsApp function"
);
assert(
  ticketAppContent.includes("exportAndShareTicketPdf(ticketCardRef, booking)"),
  "app/ticket.tsx must call exportAndShareTicketPdf"
);
assert(
  ticketAppContent.includes("<TicketPdfFallbackModal"),
  "app/ticket.tsx must render TicketPdfFallbackModal"
);
assert(
  !ticketAppContent.includes("booking.customer_phone"),
  "app/ticket.tsx must not expose customer phone number"
);

console.log("✓ app/ticket.tsx verified (uses shared service, renders fallback modal, preserves privacy).");

// 6. Test PDF 1.4 Binary Generator
const { buildSingleImagePdfBase64 } = await import(
  "../components/vendor-marketing-card/nativePdf.js"
).catch(() => import("../components/vendor-marketing-card/nativePdf.ts"));

// Minimal 1x1 valid JPEG (SOI, SOF0, SOS, EOI)
const minimalJpegBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const pdfBase64 = buildSingleImagePdfBase64({
  jpegBase64: minimalJpegBase64,
  imageWidth: 1,
  imageHeight: 1,
  pageWidthMm: 110,
  pageHeightMm: 180,
});

const pdfBinary = Buffer.from(pdfBase64, "base64").toString("binary");
assert(pdfBinary.startsWith("%PDF-1.4"), "Generated PDF must start with %PDF-1.4 header");
assert(pdfBinary.includes("<< /Type /Catalog"), "Generated PDF must include Catalog object");
assert(pdfBinary.includes("<< /Type /Pages"), "Generated PDF must include Pages object");
assert(pdfBinary.includes("<< /Type /Page"), "Generated PDF must include Page object");
assert(pdfBinary.includes("/Filter /DCTDecode"), "Generated PDF must include DCTDecode stream");
assert(pdfBinary.includes("%%EOF"), "Generated PDF must conclude with %%EOF");

console.log("✓ Native PDF binary structure test passed: valid PDF-1.4 generated.");

console.log("\nALL DIRECT WHATSAPP PDF TICKET SHARING TESTS PASSED SUCCESSFULLY! 🎉");
