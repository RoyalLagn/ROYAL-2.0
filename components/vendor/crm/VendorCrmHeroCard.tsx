import React from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Check, Sparkles, Star } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

/**
 * 3D-styled realistic DSLR Camera with body, lens rings, and flash details
 */
export function DslrCameraArt({ isSmall = false }: { isSmall?: boolean }) {
  return (
    <View style={[styles.cameraWrap, isSmall && styles.cameraWrapSmall]}>
      {/* Soft Pink Radial Glow */}
      <View style={[styles.cameraGlow, isSmall && styles.cameraGlowSmall]} />

      {/* Main Camera Body */}
      <View style={[styles.cameraBody, isSmall && styles.cameraBodySmall]}>
        {/* Top Viewfinder / Flash hump */}
        <View style={[styles.cameraPrism, isSmall && styles.cameraPrismSmall]}>
          <View style={styles.hotshoe} />
        </View>

        {/* Right handgrip texture */}
        <View style={[styles.cameraGrip, isSmall && styles.cameraGripSmall]} />

        {/* Shutter Button & Dial */}
        <View style={[styles.shutterBtn, isSmall && styles.shutterBtnSmall]} />
        <View style={[styles.modeDial, isSmall && styles.modeDialSmall]} />

        {/* Lens Barrel */}
        <View style={[styles.lensOuter, isSmall && styles.lensOuterSmall]}>
          <View style={[styles.lensRibbedRing, isSmall && styles.lensRibbedRingSmall]} />
          <View style={[styles.lensGlass, isSmall && styles.lensGlassSmall]}>
            <View style={[styles.lensReflection, isSmall && styles.lensReflectionSmall]} />
            <View style={[styles.lensCenter, isSmall && styles.lensCenterSmall]} />
          </View>
        </View>

        {/* Red accent line (Canon L-lens style) */}
        <View style={[styles.lensRedRing, isSmall && styles.lensRedRingSmall]} />
      </View>
    </View>
  );
}

export interface VendorCrmHeroCardProps {
  vendorName?: string;
  isVerified?: boolean;
  pincode?: string | null;
  featuredPincode?: string | null;
  averageRating?: number;
  reviewCount?: number;
  onPressReviews?: () => void;
}

export default function VendorCrmHeroCard({
  vendorName = "Tejas Photography",
  isVerified = true,
  pincode,
  featuredPincode,
  averageRating,
  reviewCount,
  onPressReviews,
}: VendorCrmHeroCardProps) {
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 900;
  const isSmall = width < 400;

  const displayPincode = featuredPincode || pincode || "410501";

  return (
    <LinearGradient
      colors={isDark ? ["#2A1E27", "#1A161F", "#111827"] : ["#FFF0F5", "#FFF7FA", "#FFFFFF"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.heroCard, isDark && styles.heroCardDark]}
    >
      <View style={styles.heroContentRow}>
        <View style={styles.heroTextCol}>
          <Text style={[styles.heroGreeting, isDark && styles.textMutedDark]}>
            Good to see you,
          </Text>
          <Text style={[styles.heroName, isDark && styles.textDark]}>
            {vendorName}{" "}
            <Text style={{ fontSize: isDesktop ? 22 : 18 }}>👏</Text>
          </Text>
          <Text style={[styles.heroSub, isDark && styles.textMutedDark]}>
            Track your business, manage bookings and grow with RoyalLagn.
          </Text>

          {/* Badges Row */}
          <View style={styles.badgesRow}>
            {isVerified ? (
              <View style={[styles.verifiedPill, isDark && styles.verifiedPillDark]}>
                <Check size={12} color="#059669" strokeWidth={3} />
                <Text style={styles.verifiedText}>Verified Vendor</Text>
              </View>
            ) : null}

            {averageRating !== undefined ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Customer rating ${averageRating > 0 ? averageRating.toFixed(1) : "New"}`}
                onPress={onPressReviews}
                style={({ pressed }: any) => [
                  styles.ratingPill,
                  isDark && styles.ratingPillDark,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Star size={11} color="#E8A52F" fill="#E8A52F" />
                <Text style={[styles.ratingText, isDark && styles.textDark]}>
                  {averageRating > 0 ? averageRating.toFixed(1) : "New"}
                  {reviewCount !== undefined && reviewCount > 0 ? ` (${reviewCount})` : ""}
                </Text>
              </Pressable>
            ) : null}

            <View style={[styles.featuredPill, isDark && styles.featuredPillDark]}>
              <Text style={[styles.featuredText, isDark && styles.textDark]}>
                Featured in PIN {displayPincode}
              </Text>
            </View>
          </View>
        </View>

        {/* 3D DSLR Camera Illustration */}
        <DslrCameraArt isSmall={!isDesktop} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 18,
    position: "relative",
    overflow: "hidden",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as any,
  },
  heroCardDark: {
    borderColor: "#374151",
  },
  heroContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  heroTextCol: {
    flex: 1,
    paddingRight: 8,
    minWidth: 0,
  },
  heroGreeting: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 2,
  },
  heroName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    marginBottom: 12,
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedDark: {
    color: "#9CA3AF",
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  verifiedPillDark: {
    backgroundColor: "#064E3B",
    borderColor: "#059669",
  },
  verifiedText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#059669",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  ratingPillDark: {
    backgroundColor: "#3B2F1F",
    borderColor: "#78350F",
  },
  ratingText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#92400E",
  },
  featuredPill: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  featuredPillDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  featuredText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#4B5563",
  },
  // Camera Illustration
  cameraWrap: {
    width: 120,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
  },
  cameraWrapSmall: {
    width: 76,
    height: 68,
  },
  cameraGlow: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(233, 30, 99, 0.08)",
  },
  cameraGlowSmall: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  cameraBody: {
    width: 86,
    height: 60,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cameraBodySmall: {
    width: 60,
    height: 42,
    borderRadius: 8,
  },
  cameraPrism: {
    position: "absolute",
    top: -9,
    width: 32,
    height: 10,
    backgroundColor: "#111827",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 1.5,
    borderColor: "#374151",
    alignItems: "center",
  },
  cameraPrismSmall: {
    top: -7,
    width: 24,
    height: 8,
  },
  hotshoe: {
    width: 10,
    height: 2,
    backgroundColor: "#9CA3AF",
    marginTop: 1,
  },
  cameraGrip: {
    position: "absolute",
    right: 2,
    top: 4,
    bottom: 4,
    width: 12,
    backgroundColor: "#111827",
    borderRadius: 4,
  },
  cameraGripSmall: {
    width: 8,
  },
  shutterBtn: {
    position: "absolute",
    top: -5,
    right: 12,
    width: 8,
    height: 6,
    backgroundColor: "#9CA3AF",
    borderRadius: 2,
  },
  shutterBtnSmall: {
    top: -4,
    right: 8,
    width: 6,
    height: 4,
  },
  modeDial: {
    position: "absolute",
    top: -5,
    left: 10,
    width: 9,
    height: 5,
    backgroundColor: "#4B5563",
    borderRadius: 2,
  },
  modeDialSmall: {
    top: -4,
    left: 8,
    width: 7,
    height: 4,
  },
  lensOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#4B5563",
    alignItems: "center",
    justifyContent: "center",
  },
  lensOuterSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  lensRibbedRing: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#374151",
  },
  lensRibbedRingSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  lensGlass: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  lensGlassSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  lensReflection: {
    position: "absolute",
    top: 2,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(56, 189, 248, 0.4)",
  },
  lensReflectionSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  lensCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1E293B",
  },
  lensCenterSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lensRedRing: {
    position: "absolute",
    bottom: 3,
    width: 40,
    height: 2,
    backgroundColor: "#EF4444",
  },
  lensRedRingSmall: {
    width: 30,
    height: 1.5,
  },
});
