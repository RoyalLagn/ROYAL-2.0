import React from "react";
import {
  HiddenExportCard,
  marketingCardFileName,
  PDF_EXPORT_WIDTH,
  PDF_PAGE_HEIGHT_MM,
  PDF_PAGE_WIDTH_MM,
} from "@/components/vendor-marketing-card/MarketingCardPdf.shared";

export { HiddenExportCard, PDF_EXPORT_WIDTH };

async function captureImageData(captureRef: React.RefObject<any>): Promise<string> {
  if (!captureRef.current) throw new Error("Marketing card is not ready yet. Please wait a moment and try again.");

  // react-native-view-shot's web backend calls the legacy `findNodeHandle`
  // API, which react-native-web does not implement. This base module is the
  // web implementation; Metro resolves MarketingCardPdf.native.tsx on iOS
  // and Android instead.
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(captureRef.current as HTMLElement, {
    backgroundColor: "#FFFFFF",
    useCORS: true,
    scale: 1,
  });
  return canvas.toDataURL("image/png", 1);
}

export async function exportMarketingCardPdf(captureRef: React.RefObject<any>, businessName: string): Promise<void> {
  const imageData = await captureImageData(captureRef);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM] });
  doc.addImage(imageData, "PNG", 0, 0, PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM, undefined, "FAST");

  const fileName = marketingCardFileName(businessName);

  doc.save(fileName);
}
