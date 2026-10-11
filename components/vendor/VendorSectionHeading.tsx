import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { VENDOR_TAB_BASE_HEIGHT } from "@/components/vendor/VendorBottomNav";
import VendorProfileSectionTabs from "@/components/vendor/VendorProfileSectionTabs";
import { typeScale } from "@/constants/typography";

type Props = {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  /** Icon-only back control. Section pages return to Business Details. */
  backTo?: string;
  trailing?: React.ReactNode;
};

export function useVendorSectionPageStyle() {
  const { width } = useWindowDimensions();
  const roomy = width >= 760;
  const showBottomNav = width < 900;
  return [
    styles.page,
    roomy && styles.pageRoomy,
    showBottomNav && { paddingBottom: 28 + VENDOR_TAB_BASE_HEIGHT + 20 },
  ];
}

export default function VendorSectionHeading({
  title,
  subtitle,
  badge,
  backTo = "/VendorEditBusinessInfo",
  trailing,
}: Props) {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];

  return (
    <View style={styles.intro}>
      <View style={styles.titleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.push(backTo as never)}
          hitSlop={6}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {badge}
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      <VendorProfileSectionTabs />
      {trailing ? <View style={styles.actionRow}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 18,
  },
  pageRoomy: {
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 22,
  },
  intro: {
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: -12,
    alignItems: "center",
    justifyContent: "center",
  },
  backPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  title: {
    fontSize: typeScale.pageTitle,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: typeScale.body,
    lineHeight: 21,
    maxWidth: 680,
  },
  trailing: {
    marginLeft: "auto",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
});
