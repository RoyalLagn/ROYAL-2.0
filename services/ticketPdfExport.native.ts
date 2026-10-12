import type React from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { captureRef as captureViewRef } from "react-native-view-shot";
import type { VendorBooking } from "@/services/vendorBookings";
import { buildSingleImagePdfBase64 } from "@/components/vendor-marketing-card/nativePdf";
import type { TicketPdfShareResult } from "./ticketPdfExport";

export type { TicketPdfShareResult };

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Parses JPEG markers (SOF0/SOF2) to extract exact image dimensions
 */
function getJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] === 0xff) {
      const marker = bytes[i + 1];
      // Baseline DCT (0xC0) or Progressive DCT (0xC2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + length;
    } else {
      i += 1;
    }
  }
  return { width: 1080, height: 1800 };
}

/**
 * Native (iOS/Android) implementation of RoyalLagn E-Ticket PDF Export and Sharing.
 * Uses react-native-view-shot to capture view, encodes into PDF with dynamic aspect ratio,
 * and launches native Share Sheet (WhatsApp, Gmail, Save to Files, etc.) via expo-sharing.
 */
export async function exportAndShareTicketPdf(
  captureRef: React.RefObject<any>,
  booking: VendorBooking
): Promise<TicketPdfShareResult> {
  if (!captureRef.current) {
    return {
      success: false,
      error: "Ticket is still rendering. Please wait a moment and try again.",
    };
  }
  if (!FileSystem.cacheDirectory) {
    return {
      success: false,
      error: "Temporary cache storage is not available on this device.",
    };
  }

  try {
    // Capture view to high-res JPEG base64 at 1080px width
    const jpegBase64 = await captureViewRef(captureRef, {
      format: "jpg",
      quality: 0.95,
      result: "base64",
      width: 1080,
    });

    const jpegBytes = base64ToBytes(jpegBase64);
    const { width: imgWidth, height: imgHeight } = getJpegDimensions(jpegBytes);

    const pageWidthMm = 110;
    // Dynamic height calculation ensures long tickets with multiple packages are never clipped or stretched
    const pageHeightMm = Math.round((imgHeight / imgWidth) * pageWidthMm * 10) / 10;

    const pdfBase64 = buildSingleImagePdfBase64({
      jpegBase64,
      imageWidth: imgWidth,
      imageHeight: imgHeight,
      pageWidthMm,
      pageHeightMm,
    });

    const cleanTicketId = (booking.ticket_id || "Booking").replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `RoyalLagn-Ticket-${cleanTicketId}.pdf`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, pdfBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        mimeType: "application/pdf",
        dialogTitle: `Share RoyalLagn E-Ticket (${booking.ticket_id})`,
        UTI: "com.adobe.pdf",
      });
      return { success: true, method: "native-share" };
    } else {
      return {
        success: false,
        error: "Sharing is not supported on this device.",
      };
    }
  } catch (err: any) {
    console.error("Native ticket PDF sharing error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate ticket PDF.",
    };
  }
}
