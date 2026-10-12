import type React from "react";
import type { VendorBooking } from "@/services/vendorBookings";

export type TicketPdfShareResult =
  | { success: true; method: "web-share" | "native-share" }
  | { success: true; method: "download-fallback"; fileName: string }
  | { success: false; dismissed: true }
  | { success: false; error: string };

/**
 * Web implementation of RoyalLagn E-Ticket PDF Export and Sharing.
 * Uses html2canvas to capture the ticket pass DOM element at 2x resolution,
 * compiles it into a high-fidelity PDF with dynamic aspect ratio using jsPDF,
 * and handles Web Share API or triggers direct download fallback.
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

  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const element = captureRef.current as HTMLElement;

    // Render 2x resolution canvas for sharp typography & badges
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      useCORS: true,
      scale: 2,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (el) => {
        const label = el.getAttribute("aria-label")?.toLowerCase() || "";
        const isExclude =
          el.getAttribute("data-pdf-exclude") === "true" ||
          el.getAttribute("data-pdf-ignore") === "true" ||
          label.includes("share") ||
          label.includes("forward") ||
          label.includes("close") ||
          el.classList?.contains("pdf-exclude");
        return Boolean(isExclude);
      },
      onclone: (clonedDoc, clonedElement) => {
        // 1. Remove any share buttons, close buttons, or interactive CTA elements in the cloned document
        const toRemove = clonedDoc.querySelectorAll(
          '[data-pdf-exclude="true"], [data-pdf-ignore="true"], [aria-label*="Share" i], [aria-label*="share" i], [aria-label*="Close" i], [aria-label*="close" i], [aria-label*="Forward" i]'
        );
        toRemove.forEach((node) => node.remove());

        // 2. Expand cloned ticket container to full height without scrolling or clipping
        if (clonedElement) {
          clonedElement.style.maxHeight = "none";
          clonedElement.style.height = "auto";
          clonedElement.style.overflow = "visible";

          // Expand all nested ScrollViews / overflow containers
          const nestedOverflow = clonedElement.querySelectorAll<HTMLElement>("div, section");
          nestedOverflow.forEach((el) => {
            if (
              el.style.overflowY === "auto" ||
              el.style.overflowY === "scroll" ||
              el.style.overflow === "hidden"
            ) {
              el.style.overflow = "visible";
              el.style.maxHeight = "none";
              el.style.height = "auto";
            }
          });
        }

        // 3. Fix text clipping: unset webkit-line-clamp and overflow hidden on text nodes
        const allTextNodes = clonedDoc.querySelectorAll("div, span, p");
        allTextNodes.forEach((node) => {
          const el = node as HTMLElement;
          if (el && el.style) {
            const styleAny = el.style as any;
            if (styleAny.webkitLineClamp || styleAny.lineClamp) {
              styleAny.webkitLineClamp = "unset";
              styleAny.lineClamp = "unset";
              el.style.overflow = "visible";
              el.style.maxHeight = "none";
            }
          }
        });
      },
    });

    const imgData = canvas.toDataURL("image/png", 1.0);
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;

    // Sized proportionally to luxury mobile ticket pass (110mm width)
    const pdfWidthMm = 110;
    // Dynamic page height so tall tickets expand naturally without shrinking or clipping
    const pdfHeightMm = Math.round((imgHeightPx / imgWidthPx) * pdfWidthMm * 10) / 10;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [pdfWidthMm, pdfHeightMm],
    });

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidthMm, pdfHeightMm, undefined, "FAST");

    const cleanTicketId = (booking.ticket_id || "Booking").replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `RoyalLagn-Ticket-${cleanTicketId}.pdf`;

    // 1. Check Web Share API support for files
    if (typeof navigator !== "undefined" && typeof File !== "undefined") {
      const pdfBlob = pdf.output("blob");
      const pdfFile = new File([pdfBlob], fileName, {
        type: "application/pdf",
        lastModified: Date.now(),
      });
      const browserNav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };

      const canShareFiles =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [pdfFile] });

      if (canShareFiles) {
        try {
          // Strictly files-only sharing without text parameter to ensure WhatsApp attaches the PDF as a document
          await navigator.share({
            title: fileName,
            files: [pdfFile],
          });
          return { success: true, method: "web-share" };
        } catch (err: any) {
          if (err?.name === "AbortError") {
            // User intentionally closed or cancelled the native share sheet
            // Do NOT download file, do NOT show error
            return { success: false, dismissed: true };
          }
          console.warn("navigator.share with PDF failed, falling back to download:", err);
          pdf.save(fileName);
          return { success: true, method: "download-fallback", fileName };
        }
      }
    }

    // 2. If Web Share with files is unsupported (Desktop Chrome/Windows, Firefox, macOS):
    // Automatically download the PDF and trigger the guidance fallback modal
    pdf.save(fileName);
    return { success: true, method: "download-fallback", fileName };
  } catch (err: any) {
    console.error("Failed to export ticket PDF:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate ticket PDF.",
    };
  }
}
