import React, { useMemo } from "react";
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * "blend"  — desktop: contain foreground over a blurred dominant-colour wash.
 *            Needed because a wide desktop shell letterboxes a 16:9 upload.
 * "cover"  — mobile: one image, cropped to fill. The shell is locked to the
 *            upload's own ratio there, so there is nothing to letterbox and any
 *            extra layer would only show up as a strip.
 */
type HeroSlideMediaFill = "blend" | "cover";

type HeroSlideMediaProps = {
  uri: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  fill?: HeroSlideMediaFill;
  /** Applied to the image itself, not just the shell, so corners cannot fringe. */
  borderRadius?: number;
};

/** True when a path segment is a Cloudinary transformation chain (not a public_id folder). */
function isTransformSegment(segment: string) {
  if (!segment || segment === ".") return false;
  if (/^v\d+$/.test(segment)) return false;
  // Multi-option chains always contain commas (e.g. c_pad,b_white,w_1200).
  if (segment.includes(",")) return true;
  // Single options use short prefixes — avoid matching folder names like hero_slides.
  return /^(?:(?:[a-z]{1,2}|fl|pg|dpr|t)_[a-zA-Z0-9.:-]+|q_auto|f_auto)$/i.test(segment);
}

/**
 * Rebuild a Cloudinary delivery URL with a clean transform chain.
 * Drops prior transforms (including c_pad / b_white) so white letterboxing
 * cannot reappear from stacked upload URLs.
 */
export function heroDeliveryUrl(
  url: string,
  variant: "background" | "foreground",
): string {
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

    // Both variants start with e_trim so solid (usually white) padding baked into
    // an upload is cut off the actual pixels — never masked with c_pad / b_white.
    //
    // Background keeps the FULL trimmed frame (c_limit, no crop) at 64px wide, so the
    // wash is the image's own dominant colors and its left/right edge colors line up
    // with the foreground's edges. A cropped background (c_fill/g_auto) is what made
    // the letterbox band read as a hard border. 64px + e_blur:2000 leaves no readable
    // detail on any platform, so it does not depend on a CSS filter to stop being a
    // duplicate — Expo Go and the APK get the same wash as web.
    const transforms =
      variant === "background"
        ? "e_trim/c_limit,w_64,e_blur:2000,f_auto,q_auto"
        : "e_trim/f_auto,q_auto";

    parsed.pathname = `${parsed.pathname.slice(0, index + marker.length)}${transforms}/${assetPath}`;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Two-layer hero fill:
 * - Heavily blurred cover wash (dominant colors only)
 * - Clear contain foreground (full subject/text visible, centered)
 *
 * Border radius is applied only by the outer hero shell so nested radius
 * cannot create the 1px white fringe around the image.
 */
export default function HeroSlideMedia({
  uri,
  accessibilityLabel,
  style,
  fill = "blend",
  borderRadius = 0,
}: HeroSlideMediaProps) {
  const backgroundUri = useMemo(() => heroDeliveryUrl(uri, "background"), [uri]);
  const foregroundUri = useMemo(() => heroDeliveryUrl(uri, "foreground"), [uri]);

  if (!uri.trim()) {
    return <View style={[styles.root, style]} />;
  }

  // Single layer: no wash, no gradient, no fallback plate behind it. The radius
  // rides on the image so there is no seam between a rounded shell and a square
  // child on any renderer.
  if (fill === "cover") {
    return (
      <View pointerEvents="none" style={[styles.root, { borderRadius }, style]}>
        <Image
          source={{ uri: foregroundUri }}
          resizeMode="cover"
          accessibilityLabel={accessibilityLabel}
          style={[styles.layer, styles.transparentImage, { borderRadius }]}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[styles.root, { borderRadius }, style]}>
      <Image
        source={{ uri: backgroundUri }}
        resizeMode="cover"
        // blurRadius is the one blur API that exists on web, iOS and Android alike,
        // so the wash renders identically everywhere (a CSS `filter` would be web-only).
        blurRadius={24}
        // RN-web forwards these two straight to the DOM and React warns; it wants aria-hidden.
        {...(Platform.OS === "web"
          ? { "aria-hidden": true }
          : {
              accessibilityElementsHidden: true,
              importantForAccessibility: "no-hide-descendants" as const,
            })}
        style={[styles.layer, styles.background, styles.transparentImage]}
      />
      <LinearGradient
        colors={[
          "rgba(20,12,16,0.20)",
          "rgba(20,12,16,0.04)",
          "rgba(20,12,16,0.20)",
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradient}
      />
      <Image
        source={{ uri: foregroundUri }}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
        style={[styles.layer, styles.foreground, styles.transparentImage]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  transparentImage: {
    backgroundColor: "transparent",
  },
  background: {
    // Full opacity: the wash has to sit at the same brightness as the foreground,
    // otherwise the contain letterbox band reads as a border around the image.
    opacity: 1,
    // Slight scale only to push the blur's soft edges outside the clip box.
    transform: [{ scale: 1.12 }],
  },
  gradient: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  foreground: {
    zIndex: 1,
  },
});
