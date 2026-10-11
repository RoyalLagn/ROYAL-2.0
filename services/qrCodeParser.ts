import jsQR from "jsqr";
import { Platform } from "react-native";

export const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export type ParsedUpiResult = {
  valid: boolean;
  upiId: string | null;
  payeeName: string | null;
  error?: string;
  raw?: string;
};

/**
 * Validates whether a string matches the standard Indian NPCI UPI ID format (e.g. name@okhdfcbank).
 */
export function validateUpiId(upiId: string): boolean {
  if (!upiId) return false;
  return UPI_ID_REGEX.test(upiId.trim());
}

/**
 * Normalizes a UPI ID to trimmed lowercase format.
 */
export function normalizeUpiId(upiId: string): string {
  return (upiId || "").trim().toLowerCase();
}

/**
 * Safely parses an NPCI standard UPI URI (e.g. upi://pay?pa=name@bank&pn=John%20Doe).
 * Strictly rejects arbitrary http/https links or non-UPI payloads to prevent security issues.
 */
export function parseUpiString(rawText: string): ParsedUpiResult {
  const text = (rawText || "").trim();
  if (!text) {
    return { valid: false, upiId: null, payeeName: null, error: "Empty QR code content." };
  }

  // Security guard: Never process or allow arbitrary web URLs
  if (/^https?:\/\//i.test(text)) {
    return {
      valid: false,
      upiId: null,
      payeeName: null,
      error: "Unsupported QR format. Web URLs are not permitted. Please upload a personal UPI receiving QR code.",
      raw: text,
    };
  }

  // Direct UPI ID check (some QR codes simply encode the raw UPI ID like "user@bank")
  if (validateUpiId(text)) {
    return {
      valid: true,
      upiId: normalizeUpiId(text),
      payeeName: null,
      raw: text,
    };
  }

  // Must match UPI URI protocol or contain UPI parameters
  if (!text.toLowerCase().startsWith("upi://") && !text.includes("pa=")) {
    return {
      valid: false,
      upiId: null,
      payeeName: null,
      error: "Invalid QR code. The uploaded image does not contain a valid UPI payment destination.",
      raw: text,
    };
  }

  try {
    const queryString = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text.replace(/^upi:\/\/pay\/?/i, "");
    const params = new URLSearchParams(queryString);

    const pa = params.get("pa");
    if (!pa || !validateUpiId(pa)) {
      return {
        valid: false,
        upiId: null,
        payeeName: null,
        error: "QR code is missing a valid UPI payee address (pa parameter).",
        raw: text,
      };
    }

    const pn = params.get("pn");
    const payeeName = pn ? decodeURIComponent(pn.replace(/\+/g, " ")).trim() : null;

    return {
      valid: true,
      upiId: normalizeUpiId(pa),
      payeeName: payeeName || null,
      raw: text,
    };
  } catch (err: any) {
    return {
      valid: false,
      upiId: null,
      payeeName: null,
      error: "Could not decode UPI parameters from QR: " + (err.message || String(err)),
      raw: text,
    };
  }
}

/**
 * Compares a manually entered UPI ID against the UPI ID extracted from a QR code.
 */
export function doUpiIdsMatch(enteredUpi: string, qrUpi: string): boolean {
  if (!enteredUpi || !qrUpi) return false;
  return normalizeUpiId(enteredUpi) === normalizeUpiId(qrUpi);
}

/**
 * Safely decodes a QR code from an image URI / base64 string.
 * Uses in-memory Canvas pixel inspection on web, and safe fallback.
 */
export async function decodeQrFromImageUri(
  imageUri: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!imageUri) {
    return { success: false, error: "No image provided." };
  }

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            resolve({ success: false, error: "Canvas 2D context unavailable." });
            return;
          }

          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            resolve({ success: true, data: code.data });
          } else {
            // Retry with invert
            const codeInverted = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "invertFirst",
            });
            if (codeInverted && codeInverted.data) {
              resolve({ success: true, data: codeInverted.data });
            } else {
              resolve({
                success: false,
                error: "Could not read QR code from image. Please ensure the QR code is clear and not cropped.",
              });
            }
          }
        } catch (err: any) {
          resolve({
            success: false,
            error: "Failed to process image: " + (err.message || String(err)),
          });
        }
      };

      img.onerror = () => {
        resolve({
          success: false,
          error: "Failed to load image for QR decoding. Please enter your UPI ID manually.",
        });
      };

      img.src = imageUri;
    });
  }

  // On Native devices where Canvas isn't directly in DOM:
  // We can return a helpful prompt for the customer to confirm or enter the UPI ID.
  return {
    success: false,
    error: "Automatic QR scanning is supported on web. Please enter your UPI ID manually below.",
  };
}
