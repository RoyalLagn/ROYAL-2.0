import React, { useEffect } from "react";
import { StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "@/components/ThemeProvider";
import { MotionDuration } from "@/utils/motion";

/**
 * Skeleton primitives for content-based loading (vendor cards, profile
 * headers, portfolio grids, dashboard cards, admin tables, ...).
 *
 * Generalizes the shimmer technique already used in
 * components/admin/crm/ui/SkeletonLoader.tsx into a shared, reusable base
 * so every screen gets the same look instead of re-implementing shimmer
 * logic. Dimensions are passed in by the caller so the skeleton always
 * matches the real content's layout and prevents shift-on-load.
 */

type BoneProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
};

/** A single shimmering placeholder block. */
export function SkeletonBone({ width = "100%", height = 14, radius = 8, style }: BoneProps) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    if (reducedMotion) {
      // A static, slightly-lighter block still reads as "loading" without
      // the looping shimmer, per the reduced-motion requirement.
      opacity.value = 0.55;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: MotionDuration.loop / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.45, { duration: MotionDuration.loop / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: isDark ? "#26202A" : "#EFE4E9",
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Vertical stack of bones with consistent spacing -- for text-line placeholders. */
export function SkeletonLines({ lines = 2, gap = 8, lastLineWidth = "60%" as DimensionValue }: { lines?: number; gap?: number; lastLineWidth?: DimensionValue }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBone key={index} width={index === lines - 1 ? lastLineWidth : "100%"} height={11} radius={5} />
      ))}
    </View>
  );
}

/** Matches VendorListingCard / VendorCard proportions -- image + two text lines. */
export function VendorCardSkeleton({ width = 168, imageHeight = 114 }: { width?: number; imageHeight?: number }) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  return (
    <View style={[styles.vendorCard, { width, backgroundColor: isDark ? "#0E141F" : "#FFFFFF", borderColor: isDark ? "#232C3D" : "#E5E7EB" }]}>
      <SkeletonBone width="100%" height={imageHeight} radius={0} />
      <View style={styles.vendorCardBody}>
        <SkeletonBone width="80%" height={12} radius={5} />
        <SkeletonBone width="55%" height={10} radius={5} style={{ marginTop: 7 }} />
        <SkeletonBone width="40%" height={10} radius={5} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/** A row of VendorCardSkeletons for horizontal vendor rails. */
export function VendorCardSkeletonRow({ count = 3, width = 168, imageHeight = 114, gap = 10 }: { count?: number; width?: number; imageHeight?: number; gap?: number }) {
  return (
    <View style={[styles.row, { gap }]} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <VendorCardSkeleton key={index} width={width} imageHeight={imageHeight} />
      ))}
    </View>
  );
}

/** Generic rounded-card skeleton for dashboard stat tiles, checklist rows, etc. */
export function SkeletonCard({ height = 76, style }: { height?: number; style?: ViewStyle }) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  return (
    <View style={[styles.card, { height, backgroundColor: isDark ? "#0E141F" : "#FFFFFF", borderColor: isDark ? "#232C3D" : "#E5E7EB" }, style]}>
      <SkeletonBone width={40} height={40} radius={13} />
      <View style={styles.cardBody}>
        <SkeletonBone width="70%" height={11} radius={5} />
        <SkeletonBone width="40%" height={9} radius={5} style={{ marginTop: 7 }} />
      </View>
    </View>
  );
}

/** Stack of SkeletonCard rows -- readiness checklist, enquiries, notifications, admin tables. */
export function SkeletonList({ count = 4, height = 76, gap = 10 }: { count?: number; height?: number; gap?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} height={height} />
      ))}
    </View>
  );
}

/** Square-ish tile grid skeleton -- portfolio/album/category grids. */
export function SkeletonGrid({ count = 6, columns = 3, gap = 8, aspectRatio = 1 }: { count?: number; columns?: number; gap?: number; aspectRatio?: number }) {
  return (
    <View style={[styles.grid, { gap }]}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={{ width: `${100 / columns - 2}%`, aspectRatio }}>
          <SkeletonBone width="100%" height={undefined as unknown as number} radius={12} style={StyleSheet.absoluteFillObject} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  vendorCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  vendorCardBody: { padding: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
  cardBody: { flex: 1, minWidth: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
});
