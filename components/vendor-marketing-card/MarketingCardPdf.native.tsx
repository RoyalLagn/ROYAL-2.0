import type React from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { captureRef as captureViewRef } from "react-native-view-shot";
import {
  HiddenExportCard,
  marketingCardFileName,
  PDF_EXPORT_HEIGHT,
  PDF_EXPORT_WIDTH,
  PDF_PAGE_HEIGHT_MM,
  PDF_PAGE_WIDTH_MM,
} from "@/components/vendor-marketing-card/MarketingCardPdf.shared";
import { buildSingleImagePdfBase64 } from "@/components/vendor-marketing-card/nativePdf";

export { HiddenExportCard, PDF_EXPORT_WIDTH };

export async function exportMarketingCardPdf(
  captureRef: React.RefObject<any>,
  businessName: string,
): Promise<void> {
  if (!captureRef.current) {
    throw new Error("Marketing card is not ready yet. Please wait a moment and try again.");
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error("A temporary storage location is not available on this device.");
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device, so the PDF could not be saved.");
  }

  const jpegBase64 = await captureViewRef(captureRef, {
    format: "jpg",
    quality: 1,
    result: "base64",
    width: PDF_EXPORT_WIDTH,
    height: PDF_EXPORT_HEIGHT,
  });
  const pdfBase64 = buildSingleImagePdfBase64({
    jpegBase64,
    imageWidth: PDF_EXPORT_WIDTH,
    imageHeight: PDF_EXPORT_HEIGHT,
    pageWidthMm: PDF_PAGE_WIDTH_MM,
    pageHeightMm: PDF_PAGE_HEIGHT_MM,
  });
  const fileName = marketingCardFileName(businessName);
  const path = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(path, {
    mimeType: "application/pdf",
    dialogTitle: "Download Marketing Card",
    UTI: "com.adobe.pdf",
  });
}
