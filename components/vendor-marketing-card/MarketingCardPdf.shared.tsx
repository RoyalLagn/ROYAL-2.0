import React from "react";
import { PixelRatio, Platform, View } from "react-native";
import MarketingCardPreview, {
  CARD_ASPECT_RATIO,
  type MarketingCardData,
} from "@/components/vendor-marketing-card/MarketingCardPreview";

// High-resolution export target. The card is authored at 1500x1000, so 3000
// wide is a 2x supersample (3000x2000) -- ~256dpi on the 297mm-wide page.
export const PDF_EXPORT_WIDTH = 3000;
export const PDF_EXPORT_HEIGHT = PDF_EXPORT_WIDTH / CARD_ASPECT_RATIO;

// React Native lays views out in points but view-shot captures physical
// pixels. Compensating for device density prevents a 3000-point export view
// from becoming a 9000-pixel bitmap on a 3x phone.
const exportLayoutWidth = Platform.OS === "web"
  ? PDF_EXPORT_WIDTH
  : PDF_EXPORT_WIDTH / PixelRatio.get();
const exportLayoutHeight = exportLayoutWidth / CARD_ASPECT_RATIO;

export const PDF_PAGE_WIDTH_MM = 297;
export const PDF_PAGE_HEIGHT_MM = PDF_PAGE_WIDTH_MM / CARD_ASPECT_RATIO;

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
      style={{
        position: "absolute",
        // On web, keeping the 3000×2000 export canvas at y=0 still expands
        // the document's vertical overflow even though it sits far left.
        // Move it fully above the viewport so it remains capturable without
        // creating thousands of pixels of empty page below the real content.
        top: Platform.OS === "web" ? -100000 : 0,
        left: -100000,
        width: exportLayoutWidth,
        height: exportLayoutHeight,
      }}
    >
      <View ref={hostRef} collapsable={false}>
        <MarketingCardPreview data={data} width={exportLayoutWidth} />
      </View>
    </View>
  );
}

export function marketingCardFileName(businessName: string) {
  const safeName = businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "vendor";
  return `${safeName}-royallagn-marketing-card.pdf`;
}
