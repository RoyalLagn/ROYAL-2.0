import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

import { HERO_IMAGE_ASPECT } from "@/types/hero";
import { mediaDeliveryUrl } from "@/utils/mediaDelivery";

const DEFAULT_HERO_FALLBACK = require("../../assets/images/optimized/cat-venue.webp");

type HeroSlideMediaProps = {
  uri: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Corner radius on the 16:9 wrapper (overflow hidden). */
  borderRadius?: number;
  /** Display width of the hero shell. */
  displayWidth?: number;
  /** When true, mark as LCP-critical (eager load / high fetch priority on web). */
  priority?: boolean;
};

/**
 * Delivery URL with f_auto/q_auto and a width cap so mobile does not download
 * full-resolution hero creatives. Uses c_limit (no crop).
 */
export function heroDeliveryUrl(url: string, displayWidth = 750): string {
  // Cap delivery width so large desktop shells don't pull multi‑MB creatives.
  const cssWidth = Math.max(320, Math.min(900, Math.round(displayWidth || 750)));
  return mediaDeliveryUrl(url, {
    width: cssWidth,
    crop: "limit",
    dpr: 2,
    quality: "auto",
  });
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
  displayWidth = 750,
  priority = false,
}: HeroSlideMediaProps) {
  const [hasError, setHasError] = useState(false);

  // uri may already include transforms (HeroCarousel maps them); re-apply as a safety net.
  const deliveryUri = useMemo(
    () => heroDeliveryUrl(uri, displayWidth),
    [displayWidth, uri],
  );

  useEffect(() => {
    setHasError(false);
  }, [uri]);

  if (!uri.trim() || hasError) {
    return (
      <View style={[styles.wrapper, { borderRadius }, style]}>
        <Image
          source={DEFAULT_HERO_FALLBACK}
          accessibilityLabel={accessibilityLabel || "Hero banner"}
          resizeMode="cover"
          style={Platform.OS === "web" ? { ...webImageStyle, objectFit: "cover" } : styles.imageNative}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { borderRadius }, style]}>
      <Image
        source={{ uri: deliveryUri }}
        accessibilityLabel={accessibilityLabel}
        resizeMode="contain"
        onError={() => setHasError(true)}
        // @ts-expect-error — RN Web supports loading / fetchPriority
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
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
    // The carousel shell owns the theme-aware fallback. Keeping this layer
    // transparent prevents a dark seam from leaking around contained media.
    backgroundColor: "transparent",
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
