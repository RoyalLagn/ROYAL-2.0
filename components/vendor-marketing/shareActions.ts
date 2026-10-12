import { Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { recordVendorProfileEvent } from "@/services/vendorPublicProfile";
import { shareVendorProfile, type VendorShareResult } from "@/services/vendorShare";
import { addTrafficSourceToUrl } from "@/services/trafficSource";

export async function copyProfileLink(vendorId: string, url: string) {
  if (!url) return;
  await Clipboard.setStringAsync(addTrafficSourceToUrl(url, "share"));
  await recordVendorProfileEvent(vendorId, "copy_link", "marketing_center").catch(() => {});
}

export async function shareProfileLink(vendorId: string, vendorName: string, slug: string, source?: string): Promise<VendorShareResult | "skipped"> {
  if (!slug) return "skipped";
  const result = await shareVendorProfile({ vendorId, vendorName, slug });
  if (result !== "dismissed") {
    await recordVendorProfileEvent(vendorId, "link_share", source ?? "marketing_center").catch(() => {});
  }
  return result;
}

export async function downloadQrCode(slug: string, qrUrl: string, qrRef: React.RefObject<any>) {
  if (!slug || !qrUrl) return;
  if (Platform.OS === "web") {
    const QRCodeLib = await import("qrcode");
    const dataUrl = await QRCodeLib.toDataURL(qrUrl, { width: 512, margin: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${slug}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }
  const [ViewShot, Sharing] = await Promise.all([
    import("react-native-view-shot"),
    import("expo-sharing"),
  ]);
  if (!qrRef.current) return;
  const uri = await ViewShot.captureRef(qrRef, { format: "png", quality: 1 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
}

export async function shareQrCode(vendorId: string, vendorName: string, slug: string, qrUrl: string, qrRef: React.RefObject<any>): Promise<VendorShareResult | "shared"> {
  if (!slug || !qrUrl) return "dismissed";
  if (Platform.OS === "web") {
    const QRCodeLib = await import("qrcode");
    const dataUrl = await QRCodeLib.toDataURL(qrUrl, { width: 512, margin: 2 });
    const browserNavigator = globalThis.navigator as Navigator & {
      share?: (data: { title: string; files?: File[] }) => Promise<void>;
      canShare?: (data: { files?: File[] }) => boolean;
    };
    if (browserNavigator?.share) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `${slug}-qr.png`, { type: "image/png" });
        if (!browserNavigator.canShare || browserNavigator.canShare({ files: [file] })) {
          await browserNavigator.share({ title: `${slug} QR code`, files: [file] });
          await recordVendorProfileEvent(vendorId, "link_share", "qr").catch(() => {});
          return "shared";
        }
      } catch {
        // Fall through to link share below.
      }
    }
  } else {
    const [ViewShot, Sharing] = await Promise.all([
      import("react-native-view-shot"),
      import("expo-sharing"),
    ]);
    if (qrRef.current && (await Sharing.isAvailableAsync())) {
      const uri = await ViewShot.captureRef(qrRef, { format: "png", quality: 1 });
      await Sharing.shareAsync(uri);
      await recordVendorProfileEvent(vendorId, "link_share", "qr").catch(() => {});
      return "shared";
    }
  }
  const result = await shareProfileLink(vendorId, vendorName, slug, "qr");
  return result === "skipped" ? "dismissed" : result;
}
