import React, { useEffect } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { CalendarDays, Images, LayoutDashboard, MessageSquareText, UserRound } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "./VendorTheme";
import { supabase } from "@/services/supabase";
import { resolveVendorDestination } from "@/services/vendorAuth";

export const VENDOR_TAB_BASE_HEIGHT = 66;

const tabs = [
  { label: "Dashboard", route: "/vendor-dashboard", icon: LayoutDashboard },
  { label: "Enquiries", route: "/VendorEnquiries", icon: MessageSquareText },
  { label: "Portfolio", route: "/VendorGallery", icon: Images },
  { label: "Calendar", route: "/VendorCalendar", icon: CalendarDays },
  { label: "Profile", route: "/Vendors_dash_profile", icon: UserRound },
] as const;

const vendorWorkspaceRoutes = [
  "/vendor-dashboard",
  "/vendorenquiries",
  "/vendorgallery",
  "/vendorcalendar",
  "/vendors_dash_profile",
  "/vendoreditprofile",
  "/vendorservices",
  "/vendorsubscription",
  "/vendornotifications",
  "/vendorsettings",
  "/vendorhelp",
];

function AnimatedTab({ active, label, icon: Icon, onPress, colors }: any) {
  const scale = useSharedValue(active ? 1.06 : 1);
  useEffect(() => {
    scale.value = withTiming(active ? 1.06 : 1, { duration: 200 });
  }, [active, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} tab`} onPress={onPress} style={styles.tab}>
      <Animated.View style={[styles.iconWrap, active && { backgroundColor: colors.surfaceSoft }, animatedStyle]}>
        <Icon size={21} color={active ? colors.pink : colors.muted} strokeWidth={active ? 2.4 : 2} />
      </Animated.View>
      <Text numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.2}
        style={[styles.label, { color: active ? colors.pink : colors.muted }, active && styles.activeLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function VendorBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const normalizedPath = pathname.toLowerCase();
  const isVendorPage = vendorWorkspaceRoutes.some((route) => normalizedPath.startsWith(route));
  const shouldShow = Platform.OS !== "web" || width < 768;

  useEffect(() => {
    if (!isVendorPage) return;
    let active = true;
    supabase.auth.getUser()
      .then(async ({ data }) => {
        if (!active) return;
        if (!data.user) {
          router.replace("/DashboardCenter");
          return;
        }
        try {
          const destination = await resolveVendorDestination(data.user);
          if (active && destination.pathname !== "/vendor-dashboard") {
            router.replace(destination as never);
          }
        } catch {
          if (active) router.replace("/DashboardCenter");
        }
      })
      .catch(() => {
        if (active) router.replace("/DashboardCenter");
      });
    return () => { active = false; };
  }, [isVendorPage, router]);

  useEffect(() => {
    if (!isVendorPage) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      router.dismissAll();
      router.replace("/(tabs)");
      return true;
    });
    return () => subscription.remove();
  }, [isVendorPage, router]);

  if (!shouldShow || !isVendorPage) return null;

  const activeRoute = normalizedPath.startsWith("/vendoreditprofile") || normalizedPath.startsWith("/vendorservices")
    ? "/Vendors_dash_profile"
    : normalizedPath.startsWith("/vendorsubscription") || normalizedPath.startsWith("/vendorsettings")
      ? "/Vendors_dash_profile"
      : tabs.find((tab) => normalizedPath.startsWith(tab.route.toLowerCase()))?.route ?? "/vendor-dashboard";

  return (
    <View testID="vendor-bottom-navigation" style={[styles.bar, {
      height: VENDOR_TAB_BASE_HEIGHT + Math.max(insets.bottom, 8),
      paddingBottom: Math.max(insets.bottom, 8),
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      shadowColor: colors.shadow,
    }]}>
      {tabs.map((tab) => (
        <AnimatedTab key={tab.route} {...tab} active={activeRoute === tab.route}
          colors={colors} onPress={() => router.replace(tab.route as any)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%", zIndex: 50, flexShrink: 0,
    flexDirection: "row", alignItems: "flex-start", paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 14,
  },
  tab: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "flex-start", gap: 1 },
  iconWrap: { width: 34, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, lineHeight: 14, fontWeight: "500", textAlign: "center", maxWidth: "100%" },
  activeLabel: { fontWeight: "700" },
});
