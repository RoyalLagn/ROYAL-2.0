import React from "react";
import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from "react-native";

type MembershipBadgeAsset = { source: ImageSourcePropType };

export const MEMBERSHIP_BADGE_ASSETS: Record<string, MembershipBadgeAsset> = {
  premium: { source: require("@/assets/badges/premium-badge-v2.webp") },
  elite: { source: require("@/assets/badges/elite-badge-v2.webp") },
};

export function membershipBadgeFor(planName?: string | null): MembershipBadgeAsset | null {
  const key = planName?.trim().toLowerCase().replace(/\s+plan$/, "") ?? "";
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
  const badge = membershipBadgeFor(planName);
  if (!badge) return null;

  return (
    <Image
      accessibilityLabel={`${planName} membership badge`}
      source={badge.source}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
    />
  );
}
