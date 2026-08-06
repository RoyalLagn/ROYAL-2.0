import React, { useMemo } from "react";
import { Image, Platform, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

import { HERO_IMAGE_ASPECT } from "@/types/hero";

type HeroSlideMediaProps = {
  uri: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Corner radius on the 16:9 wrapper (overflow hidden). */
  borderRadius?: number;
};

/** True when a path segment is a Cloudinary transformation chain (not a public_id folder). */
function isTransformSegment(segment: string) {
  if (!segment || segment === ".") return false;
  if (/^v\d+$/.test(segment)) return false;
  if (segment.includes(",")) return true;
  return /^(?:(?:[a-z]{1,2}|fl|pg|dpr|t)_[a-zA-Z0-9.:-]+|q_auto|f_auto)$/i.test(segment);
}

/**
 * Delivery URL with optimize-only transforms — never c_pad / b_white / e_trim crop.
 * Preserves the original creative proportions.
 */
export function heroDeliveryUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const marker = "/image/upload/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return trimmed;

    const afterUpload = parsed.pathname.slice(index + marker.length);
    const segments = afterUpload.split("/").filter(Boolean);
    let cursor = 0;
    while (cursor < segments.length && isTransformSegment(segments[cursor])) {
      cursor += 1;
    }
    const assetPath = segments.slice(cursor).join("/");
    if (!assetPath) return trimmed;

    parsed.pathname = `${parsed.pathname.slice(0, index + marker.length)}f_auto,q_auto/${assetPath}`;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

const webImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center center",
  backgroundColor: "transparent",
} as ImageStyle;

/**
 * Hero image in a dedicated 16:9 wrapper.
 * Shows the complete original with contain — never stretch, crop, or zoom.
 */
export default function HeroSlideMedia({
  uri,
  accessibilityLabel,
  style,
  borderRadius = 0,
}: HeroSlideMediaProps) {
  const deliveryUri = useMemo(() => heroDeliveryUrl(uri), [uri]);

  if (!uri.trim()) {
    return <View style={[styles.wrapper, { borderRadius }, style]} />;
  }

  return (
    <View style={[styles.wrapper, { borderRadius }, style]}>
      <Image
        source={{ uri: deliveryUri }}
        accessibilityLabel={accessibilityLabel}
        resizeMode="contain"
        style={Platform.OS === "web" ? webImageStyle : styles.imageNative}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    aspectRatio: HERO_IMAGE_ASPECT,
    overflow: "hidden",
    backgroundColor: "#141014",
    margin: 0,
    padding: 0,
    borderWidth: 0,
    position: "relative",
  },
  // Native: aspect ratio on the image itself + contain (per product spec).
  imageNative: {
    width: "100%",
    aspectRatio: HERO_IMAGE_ASPECT,
    backgroundColor: "transparent",
  },
});
