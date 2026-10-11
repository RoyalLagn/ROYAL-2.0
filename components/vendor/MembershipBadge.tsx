import React, { useEffect } from "react";
import { Image, StyleSheet, type ImageSourcePropType, type ImageStyle, type StyleProp, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

type MembershipBadgeAsset = { source: ImageSourcePropType };

export const MEMBERSHIP_BADGE_ASSETS: Record<string, MembershipBadgeAsset> = {
  premium: { source: require("@/assets/badges/premium-badge-v2.webp") },
  elite: { source: require("@/assets/badges/elite-badge-v2.webp") },
};

export function membershipBadgeFor(planName?: string | null): MembershipBadgeAsset | null {
  const key = planName?.trim().toLowerCase().replace(/\s+plan$/, "") ?? "";
  if (key === "elite") return MEMBERSHIP_BADGE_ASSETS.premium;
  return MEMBERSHIP_BADGE_ASSETS[key] ?? null;
}

export function MembershipBadge({
  planName,
  size = 58,
  style,
}: {
  planName?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0.34);
  const badge = membershipBadgeFor(planName);

  useEffect(() => {
    if (reduceMotion || !badge) {
      glow.value = 0.34;
      return;
    }
    glow.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1150 }),
        withTiming(0.34, { duration: 1550 }),
      ),
      -1,
      false,
    );
  }, [badge, glow, reduceMotion]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  if (!badge) return null;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${planName} membership badge`}
      style={[styles.frame, { width: size, height: size }, style]}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      <Image
        accessible={false}
        source={badge.source}
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center", position: "relative" },
  glow: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 0.82 }],
    borderRadius: 999,
    backgroundColor: "rgba(218,160,54,0.16)",
    shadowColor: "#D99A2B",
    shadowOpacity: 0.62,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
