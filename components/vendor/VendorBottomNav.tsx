import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { CalendarDays, Clapperboard, Images, LayoutDashboard, UserRound } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { supabase } from "@/services/supabase";
import { resolveVendorDestination } from "@/services/vendorAuth";

const PINK = "#E91E63";
const CENTER_ROUTE = "/VendorClips";
const TAB_COUNT = 5;

export const VENDOR_TAB_BASE_HEIGHT = 58;

const AnimatedCalendar = Animated.createAnimatedComponent(CalendarDays);
const AnimatedClapperboard = Animated.createAnimatedComponent(Clapperboard);
const AnimatedDashboard = Animated.createAnimatedComponent(LayoutDashboard);
const AnimatedImages = Animated.createAnimatedComponent(Images);
const AnimatedUser = Animated.createAnimatedComponent(UserRound);

const tabs = [
  { label: "Dashboard", route: "/vendor-dashboard", icon: AnimatedDashboard },
  { label: "Portfolio", route: "/VendorGallery", icon: AnimatedImages },
  { label: "Clips", route: "/VendorClips", icon: AnimatedClapperboard },
  { label: "Calendar", route: "/VendorCalendar", icon: AnimatedCalendar },
  { label: "Profile", route: "/Vendors_dash_profile", icon: AnimatedUser },
] as const;

const vendorWorkspaceRoutes = [
  "/vendor-dashboard",
  "/vendorenquiries",
  "/vendorgallery",
  "/vendorclips",
  "/vendorclipupload",
  "/vendorclipedit",
  "/vendorcalendar",
  "/vendors_dash_profile",
  "/vendoreditprofile",
  "/vendorservices",
  "/vendorsubscription",
  "/vendornotifications",
  "/vendorsettings",
  "/vendorhelp",
  "/vendorprivacypolicy",
  "/vendorterms",
];

function AnimatedVendorTab({
  active,
  label,
  route,
  icon: Icon,
  dark,
  reducedMotion,
  onPress,
}: {
  active: boolean;
  label: string;
  route: string;
  icon: React.ComponentType<any>;
  dark: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(1);
  const center = route === CENTER_ROUTE;
  const activeColor = dark ? "#EC4899" : PINK;
  const inactiveColor = dark ? "#AAA0A5" : "#6B6B73";

  useEffect(() => {
    progress.value = reducedMotion
      ? (active ? 1 : 0)
      : withSpring(active ? 1 : 0, { damping: 18, stiffness: 210, mass: 0.7 });
  }, [active, progress, reducedMotion]);

  const visualStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [
      { translateY: center ? interpolate(progress.value, [0, 1], [0, -2]) : interpolate(progress.value, [0, 1], [0, -3]) },
      { scale: pressed.value * interpolate(progress.value, [0, 1], [1, center ? 1.06 : 1.08]) },
    ],
  } as ViewStyle));
  const circleStyle = useAnimatedStyle<ViewStyle>(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [dark ? "#D92B69" : "#E93370", activeColor]),
    shadowOpacity: interpolate(progress.value, [0, 1], [0.2, 0.32]),
  }));
  const labelStyle = useAnimatedStyle<TextStyle>(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));
  const iconProps = useAnimatedProps(() => ({
    color: center ? "#FFFFFF" : interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const pressIn = () => {
    pressed.value = reducedMotion ? 0.96 : withTiming(0.92, { duration: 90 });
  };
  const pressOut = () => {
    pressed.value = reducedMotion
      ? 1
      : withSpring(1, { damping: 15, stiffness: 260, mass: 0.55 });
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={active ? { selected: true } : {}}
      accessibilityLabel={`${label} tab`}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={styles.tab}
    >
      {center ? (
        <Animated.View style={[styles.centerVisual, visualStyle]}>
          <Animated.View style={[styles.centerCircle, circleStyle]}>
            <Icon animatedProps={iconProps} size={20} strokeWidth={2.35} />
          </Animated.View>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.regularVisual, visualStyle]}>
          <Icon animatedProps={iconProps} size={21} strokeWidth={active ? 2.35 : 2} />
        </Animated.View>
      )}
      <Animated.Text
        numberOfLines={1}
        allowFontScaling
        maxFontSizeMultiplier={1.2}
        style={[styles.label, center && styles.centerLabel, active && styles.activeLabel, labelStyle]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

export default function VendorBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const [itemsWidth, setItemsWidth] = useState(0);
  const dark = colorScheme === "dark";
  const normalizedPath = pathname.toLowerCase();
  const isVendorPage = vendorWorkspaceRoutes.some((route) => normalizedPath.startsWith(route));
  const shouldShow = Platform.OS !== "web" || width < 768;
  const activeRoute = normalizedPath.startsWith("/vendorclip")
    ? "/VendorClips"
    : normalizedPath.startsWith("/vendoreditprofile") || normalizedPath.startsWith("/vendorservices")
      ? "/Vendors_dash_profile"
      : normalizedPath.startsWith("/vendorsubscription")
        || normalizedPath.startsWith("/vendorsettings")
        || normalizedPath.startsWith("/vendorhelp")
        || normalizedPath.startsWith("/vendorprivacypolicy")
        || normalizedPath.startsWith("/vendorterms")
        ? "/Vendors_dash_profile"
        : tabs.find((tab) => normalizedPath.startsWith(tab.route.toLowerCase()))?.route ?? "/vendor-dashboard";
  const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.route === activeRoute));
  const activeIndex = useSharedValue(selectedIndex);

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

  useEffect(() => {
    activeIndex.value = reducedMotion
      ? selectedIndex
      : withSpring(selectedIndex, { damping: 20, stiffness: 190, mass: 0.75 });
  }, [activeIndex, reducedMotion, selectedIndex]);

  const indicatorStyle = useAnimatedStyle<ViewStyle>(() => {
    const itemWidth = itemsWidth / TAB_COUNT;
    return {
      width: Math.max(0, itemWidth - 10),
      opacity: Math.min(1, Math.abs(activeIndex.value - 2) * 2.5),
      transform: [{ translateX: activeIndex.value * itemWidth + 5 }],
    };
  }, [itemsWidth]);

  const onItemsLayout = (event: LayoutChangeEvent) => {
    setItemsWidth(event.nativeEvent.layout.width);
  };

  if (!shouldShow || !isVendorPage) return null;

  return (
    <View testID="vendor-bottom-navigation" style={[styles.safeWrap, {
      paddingBottom: Math.max(insets.bottom, 8),
      backgroundColor: dark ? "#070B14" : "#FFFFFF",
    }]}>
      <View style={[styles.bar, {
        backgroundColor: dark ? "#0E141F" : "#FFFFFF",
        borderColor: dark ? "#5A2B3F" : "#F3D4DF",
      }]}>
        <View style={styles.items} onLayout={onItemsLayout}>
          {itemsWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeIndicator,
                { backgroundColor: dark ? "rgba(236,72,153,.13)" : "#FFF0F6" },
                indicatorStyle,
              ]}
            />
          ) : null}
          {tabs.map((tab) => (
            <AnimatedVendorTab
              key={tab.route}
              {...tab}
              active={activeRoute === tab.route}
              dark={dark}
              reducedMotion={reducedMotion}
              onPress={() => router.replace(tab.route as any)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeWrap: { width: "100%", flexShrink: 0 },
  bar: {
    minHeight: 58,
    marginHorizontal: 10,
    borderWidth: 1,
    borderRadius: 31,
    overflow: "visible",
    shadowColor: "#573341",
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  items: { minHeight: 58, flexDirection: "row", alignItems: "stretch", position: "relative" },
  activeIndicator: { position: "absolute", top: 5, bottom: 5, borderRadius: 25 },
  tab: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "flex-start", zIndex: 2 },
  regularVisual: { width: 34, height: 31, marginTop: 7, alignItems: "center", justifyContent: "center" },
  centerVisual: { width: 44, height: 40, marginTop: 2, alignItems: "center", justifyContent: "center" },
  centerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PINK,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  label: { width: "100%", paddingHorizontal: 1, fontSize: 9.5, lineHeight: 12, fontWeight: "500", textAlign: "center", includeFontPadding: false },
  centerLabel: { marginTop: 0 },
  activeLabel: { fontWeight: "700" },
});
