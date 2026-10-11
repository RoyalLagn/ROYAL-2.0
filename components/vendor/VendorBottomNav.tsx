import React, { useCallback, useEffect, useState } from "react";
import {
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
import {
  CalendarCheck,
  CalendarDays,
  Images,
  LayoutDashboard,
  UserRound,
} from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { typeScale, typeLeading } from "@/constants/typography";
import { floatingNavigationColors, floatingNavigationTokens } from "@/constants/navigationTokens";

const TAB_COUNT = 5;

export const VENDOR_TAB_BASE_HEIGHT = floatingNavigationTokens.baseHeight;

const AnimatedDashboard = Animated.createAnimatedComponent(LayoutDashboard);
const AnimatedBookings = Animated.createAnimatedComponent(CalendarCheck);
const AnimatedCalendar = Animated.createAnimatedComponent(CalendarDays);
const AnimatedImages = Animated.createAnimatedComponent(Images);
const AnimatedUser = Animated.createAnimatedComponent(UserRound);

const tabs = [
  { label: "Dashboard", route: "/vendor-dashboard", icon: AnimatedDashboard },
  { label: "Bookings", route: "/VendorBookings", icon: AnimatedBookings },
  { label: "Calendar", route: "/VendorCalendar", icon: AnimatedCalendar },
  { label: "Portfolio", route: "/VendorGallery", icon: AnimatedImages },
  { label: "Profile", route: "/Vendors_dash_profile", icon: AnimatedUser },
] as const;

const vendorWorkspaceRoutes = [
  "/vendor-dashboard",
  "/vendorenquiries",
  "/vendorbookings",
  "/vendorgallery",
  "/vendoralbum",
  "/vendorportfolio",
  "/vendorcalendar",
  "/vendors_dash_profile",
  "/vendorsprofile",
  "/vendoreditprofile",
  "/vendoreditbusinessinfo",
  "/vendoreditabout",
  "/vendoreditcontact",
  "/vendoreditlocation",
  "/vendoredittags",
  "/vendoreditbrand",
  "/vendorservices",
  "/vendorsubscription",
  "/vendorpaymenthistory",
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
  const tabColors = dark
    ? floatingNavigationTokens.vendorTabs.dark
    : floatingNavigationTokens.vendorTabs.light;
  const activeColor = tabColors.active;
  const inactiveColor = tabColors.inactive;

  useEffect(() => {
    progress.value = reducedMotion
      ? (active ? 1 : 0)
      : withSpring(active ? 1 : 0, { damping: 18, stiffness: 210, mass: 0.7 });
  }, [active, progress, reducedMotion]);

  const visualStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -2]) },
      { scale: pressed.value * interpolate(progress.value, [0, 1], [1, 1.06]) },
    ],
  } as ViewStyle));

  const labelStyle = useAnimatedStyle<TextStyle>(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const iconProps = useAnimatedProps(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
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
      testID={`vendor-tab-${label.toLowerCase()}`}
      accessibilityRole="tab"
      accessibilityState={active ? { selected: true } : {}}
      accessibilityLabel={`${label} tab`}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      hitSlop={{ top: 4, bottom: 4 }}
      android_ripple={{ color: dark ? "rgba(236,72,153,.14)" : "rgba(233,30,99,.09)", borderless: false }}
      style={styles.tab}
    >
      <Animated.View pointerEvents="none" style={[styles.regularVisual, visualStyle]}>
        <Icon animatedProps={iconProps} size={20} strokeWidth={active ? 2.4 : 1.9} />
      </Animated.View>
      <Animated.Text
        pointerEvents="none"
        numberOfLines={1}
        allowFontScaling
        maxFontSizeMultiplier={1.2}
        style={[styles.label, active && styles.activeLabel, labelStyle]}
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
  const navigationColors = floatingNavigationColors(dark);
  const normalizedPath = pathname.toLowerCase();
  const isVendorPage = vendorWorkspaceRoutes.some((route) => normalizedPath.startsWith(route));
  const isMobile = width < 900;

  const activeRoute = normalizedPath.startsWith("/vendorbookings")
    ? "/VendorBookings"
    : normalizedPath.startsWith("/vendorcalendar")
    ? "/VendorCalendar"
    : normalizedPath.startsWith("/vendorgallery") || normalizedPath.startsWith("/vendoralbum") || normalizedPath.startsWith("/vendorportfolio")
    ? "/VendorGallery"
    : normalizedPath.startsWith("/vendors_dash_profile") ||
      normalizedPath.startsWith("/vendorsprofile") ||
      normalizedPath.startsWith("/vendoredit") ||
      normalizedPath.startsWith("/vendorservices") ||
      normalizedPath.startsWith("/vendorsettings")
    ? "/Vendors_dash_profile"
    : "/vendor-dashboard";

  const selectedIndex = tabs.findIndex((tab) => tab.route === activeRoute);
  const activeIndex = useSharedValue(selectedIndex >= 0 ? selectedIndex : 0);

  useEffect(() => {
    if (selectedIndex >= 0) {
      activeIndex.value = reducedMotion
        ? selectedIndex
        : withSpring(selectedIndex, { damping: 20, stiffness: 190, mass: 0.75 });
    }
  }, [activeIndex, reducedMotion, selectedIndex]);

  const indicatorStyle = useAnimatedStyle<ViewStyle>(() => {
    const itemWidth = itemsWidth / TAB_COUNT;
    return {
      width: Math.max(0, itemWidth - 8),
      opacity: activeIndex.value < 0 ? 0 : 1,
      transform: [{ translateX: activeIndex.value * itemWidth + 4 }],
    };
  }, [itemsWidth]);

  const onItemsLayout = (event: LayoutChangeEvent) => {
    setItemsWidth(event.nativeEvent.layout.width);
  };

  const openTab = useCallback((route: (typeof tabs)[number]["route"]) => {
    if (route === activeRoute) return;
    router.replace(route as any);
  }, [activeRoute, router]);

  if (!isMobile || !isVendorPage) return null;

  return (
    <View
      pointerEvents="box-none"
      testID="vendor-bottom-navigation"
      style={[
        styles.safeWrap,
        {
          paddingBottom: Math.max(insets.bottom, 4),
          backgroundColor: dark ? "#111827" : "#FFFFFF",
          borderTopColor: dark ? "#1F2937" : "#F3F4F6",
        },
      ]}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.bar,
          {
            backgroundColor: dark ? "#1F2937" : "#FFFFFF",
            borderColor: dark ? "#374151" : "#FCE7F3",
          },
        ]}
      >
        <View pointerEvents="box-none" style={styles.items} onLayout={onItemsLayout}>
          {itemsWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeIndicator,
                { backgroundColor: navigationColors.indicator },
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
              onPress={() => openTab(tab.route)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeWrap: {
    width: "100%",
    flexShrink: 0,
    zIndex: 1000,
    elevation: 30,
    borderTopWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  bar: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    minHeight: 56,
  },
  items: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "stretch",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 14,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    zIndex: 2,
  },
  regularVisual: {
    width: 28,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  label: {
    width: "100%",
    paddingHorizontal: 1,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "600",
    textAlign: "center",
    includeFontPadding: false,
  },
  activeLabel: {
    fontWeight: "800",
  },
});
