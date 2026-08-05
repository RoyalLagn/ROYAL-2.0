import React from "react";
import { Platform, View } from "react-native";
import MarketingCardPreview, { CARD_ASPECT_RATIO, type MarketingCardData } from "@/components/vendor-marketing-card/MarketingCardPreview";

// High-resolution export target. The card is authored at 1500x1000, so 3000
// wide is a 2x supersample (3000x2000) -- ~256dpi on the 297mm-wide page
// below, which keeps the QR crisply scannable in print without the
// out-of-memory risk a full 300dpi capture would carry on lower-end phones.
export const PDF_EXPORT_WIDTH = 3000;
const PDF_EXPORT_HEIGHT = PDF_EXPORT_WIDTH / CARD_ASPECT_RATIO;

// A landscape page whose proportions are exactly the card's 3:2, so the
// master layout is reproduced without letterboxing, stretching or cropping.
// Deliberately not A4 -- A4 is 1.414:1, not 1.5:1, so fitting the card to an
// A4 sheet would either distort the template or crop the design.
const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = PAGE_WIDTH_MM / CARD_ASPECT_RATIO;

/**
 * An off-screen, full-resolution clone of the live preview. The vendor
 * never sees this -- it exists purely so `exportMarketingCardPdf` has a
 * high-pixel-density copy of the exact same card to capture, while the
 * on-screen preview stays a comfortable display size. Kept in normal
 * layout (not `display:none`) because both the web (html2canvas) and
 * native capture backends need the node actually laid out to snapshot it.
 */
export function HiddenExportCard({
  data,
  hostRef,
}: {
  data: MarketingCardData;
  hostRef: React.RefObject<any>;
}) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: -100000, width: PDF_EXPORT_WIDTH, height: PDF_EXPORT_HEIGHT }}
    >
      <View ref={hostRef} collapsable={false}>
        <MarketingCardPreview data={data} width={PDF_EXPORT_WIDTH} />
      </View>
    </View>
  );
}

function sanitizeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vendor";
}

async function captureImageData(captureRef: React.RefObject<any>): Promise<string> {
  if (!captureRef.current) throw new Error("Marketing card is not ready yet. Please wait a moment and try again.");

  if (Platform.OS === "web") {
    // react-native-view-shot's web backend calls the legacy `findNodeHandle`
    // API, which react-native-web does not implement -- it throws instead
    // of capturing. html2canvas (view-shot's own web dependency) works
    // directly against the DOM node a react-native-web `View` ref already
    // resolves to, so we call it ourselves instead of going through
    // view-shot on this platform.
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(captureRef.current as HTMLElement, {
      backgroundColor: "#FFFFFF",
      useCORS: true,
      scale: 1,
    });
    return canvas.toDataURL("image/png", 1);
  }

  const ViewShot = await import("react-native-view-shot");
  const base64 = await ViewShot.captureRef(captureRef, { format: "png", quality: 1, result: "base64" });
  return `data:image/png;base64,${base64}`;
}

export async function exportMarketingCardPdf(captureRef: React.RefObject<any>, businessName: string): Promise<void> {
  const imageData = await captureImageData(captureRef);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM] });
  doc.addImage(imageData, "PNG", 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, undefined, "FAST");

  const fileName = `${sanitizeFileName(businessName)}-royallagn-marketing-card.pdf`;

  if (Platform.OS === "web") {
    doc.save(fileName);
    return;
  }

  const [FileSystem, Sharing] = await Promise.all([
    import("expo-file-system/legacy"),
    import("expo-sharing"),
  ]);
  const pdfBase64 = doc.output("datauristring").split(",")[1] ?? "";
  const path = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: "application/pdf", dialogTitle: "Download Marketing Card" });
  }
}
