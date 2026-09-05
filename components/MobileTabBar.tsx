import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Clapperboard, Grid3X3, Heart, Home, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "@/components/ThemeProvider";
import FavoriteNotificationDot from "@/components/favorites/FavoriteNotificationDot";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";
import { brandPalette } from "@/constants/brandPalette";
import { floatingNavigationColors, floatingNavigationTokens } from "@/constants/navigationTokens";

const CENTER_ROUTE = "clips";
const TAB_COUNT = 5;
const PUBLIC_TAB_BASE_HEIGHT = 54;
const CUSTOMER_TAB_ROUTES = new Set([
  "index",
  "Categories",
  "clips",
  "favorites",
  "profile",
]);
const STANDALONE_TABS = [
  { routeName: "index", label: "Home", href: "/(tabs)" },
  { routeName: "Categories", label: "Category", href: "/(tabs)/Categories" },
  { routeName: "clips", label: "Clips", href: "/(tabs)/clips" },
  { routeName: "favorites", label: "Favorites", href: "/(tabs)/favorites" },
  { routeName: "profile", label: "Profile", href: "/(tabs)/profile" },
] as const;

const AnimatedGrid = Animated.createAnimatedComponent(Grid3X3);
const AnimatedHeart = Animated.createAnimatedComponent(Heart);
const AnimatedHome = Animated.createAnimatedComponent(Home);
const AnimatedClapperboard = Animated.createAnimatedComponent(Clapperboard);
const AnimatedUser = Animated.createAnimatedComponent(User);

const ICONS: Record<string, React.ComponentType<any>> = {
  Categories: AnimatedGrid,
  favorites: AnimatedHeart,
  index: AnimatedHome,
  clips: AnimatedClapperboard,
  profile: AnimatedUser,
};

export const MOBILE_TAB_BASE_HEIGHT = PUBLIC_TAB_BASE_HEIGHT;

type AnimatedTabProps = {
  routeName: string;
  label: string;
  focused: boolean;
  isDark: boolean;
  reducedMotion: boolean;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

function AnimatedTab({
  routeName,
  label,
  focused,
  isDark,
  reducedMotion,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: AnimatedTabProps) {
  const active = useSharedValue(focused ? 1 : 0);
  const pressed = useSharedValue(1);
  const arrival = useSharedValue(0);
  const {
    favoriteArrivalToken,
    favoriteIndicatorToken,
    hasUnviewedFavorites,
    registerFavoritesDestination,
  } = useFavorites();
  const isCenter = routeName === CENTER_ROUTE;
  const isFavorites = routeName === "favorites";
  const tabColors = isDark
    ? floatingNavigationTokens.customerTabs.dark
    : floatingNavigationTokens.customerTabs.light;
  const activeColor = tabColors.active;
  const inactiveColor = tabColors.inactive;
  const Icon = ICONS[routeName] ?? AnimatedHome;
  const previousArrivalToken = useRef(favoriteArrivalToken);

  useEffect(() => {
    active.value = reducedMotion
      ? (focused ? 1 : 0)
      : withSpring(focused ? 1 : 0, { damping: 18, stiffness: 210, mass: 0.7 });
  }, [active, focused, reducedMotion]);

  useEffect(() => {
    if (!isFavorites || favoriteArrivalToken === previousArrivalToken.current) return;
    previousArrivalToken.current = favoriteArrivalToken;
    if (reducedMotion) {
      arrival.value = 1;
      arrival.value = withTiming(0, { duration: 220 });
    } else {
      arrival.value = withSequence(
        withTiming(1, { duration: 130 }),
        withSpring(0, { damping: 11, stiffness: 220, mass: 0.65 }),
      );
    }
  }, [arrival, favoriteArrivalToken, isFavorites, reducedMotion]);

  const visualStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [
      { translateY: isCenter ? interpolate(active.value, [0, 1], [0, -2]) : interpolate(active.value, [0, 1], [0, -3]) },
      {
        scale: pressed.value
          * interpolate(active.value, [0, 1], [1, isCenter ? 1.06 : 1.08])
          * interpolate(arrival.value, [0, 1], [1, 1.18]),
      },
    ],
  } as ViewStyle));

  const favoritePulseStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: interpolate(arrival.value, [0, 0.45, 1], [0, 0.18, 0]),
    transform: [{ scale: interpolate(arrival.value, [0, 1], [0.72, 1.55]) }],
  }));

  const labelStyle = useAnimatedStyle<TextStyle>(() => ({
    color: interpolateColor(active.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const circleStyle = useAnimatedStyle<ViewStyle>(() => ({
    backgroundColor: interpolateColor(
      active.value,
      [0, 1],
      [
        isDark
          ? floatingNavigationTokens.centerInactiveDark
          : floatingNavigationTokens.centerInactiveLight,
        activeColor,
      ],
    ),
    shadowOpacity: interpolate(active.value, [0, 1], [0.2, 0.32]),
  }));

  const iconProps = useAnimatedProps(() => ({
    color: isCenter
      ? brandPalette.light.primaryForeground
      : isFavorites && arrival.value > 0.01
        ? activeColor
        : interpolateColor(active.value, [0, 1], [inactiveColor, activeColor]),
    fill: "transparent",
  }));

  const pressIn = () => {
    pressed.value = reducedMotion ? 0.96 : withTiming(0.92, { duration: 90 });
  };
  const pressOut = () => {
    pressed.value = reducedMotion
      ? 1
      : withSpring(1, { damping: 15, stiffness: 260, mass: 0.55 });
  };

  const labelText = accessibilityLabel || label;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={isFavorites && hasUnviewedFavorites
        ? `${labelText}, new favorites available`
        : labelText}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      android_ripple={Platform.OS === "android" ? { color: isDark ? "rgba(236,72,153,.14)" : "rgba(233,30,99,.09)", borderless: false } : undefined}
      style={styles.item}
    >
      {isCenter ? (
        <Animated.View style={[styles.homeVisual, visualStyle]}>
          <Animated.View style={[styles.homeCircle, circleStyle]}>
            <Icon animatedProps={iconProps} size={19} strokeWidth={2.35} />
          </Animated.View>
        </Animated.View>
      ) : (
        <Animated.View
          ref={isFavorites ? registerFavoritesDestination as React.Ref<any> : undefined}
          style={[styles.regularVisual, visualStyle]}
        >
          {isFavorites ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.favoritePulse, favoritePulseStyle]}
            />
          ) : null}
          <Icon animatedProps={iconProps} size={20} strokeWidth={focused ? 2.35 : 2} />
          {isFavorites ? (
            <FavoriteNotificationDot
              visible={hasUnviewedFavorites}
              animationToken={favoriteIndicatorToken}
            />
          ) : null}
        </Animated.View>
      )}
      <Animated.Text
        allowFontScaling
        maxFontSizeMultiplier={1.25}
        numberOfLines={1}
        style={[styles.label, isCenter && styles.homeLabel, focused && styles.activeLabel, labelStyle]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

/**
 * Returns the total rendered height of the MobileTabBar for the current device,
 * including the bottom safe-area inset (home-indicator / gesture navigation area).
 *
 * Use this as the `paddingBottom` of any ScrollView that scrolls behind the bar,
 * so content is never obscured regardless of device or navigation mode.
 *
 * @example
 *   const tabBarHeight = useMobileTabBarHeight();
 *   <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight }} />
 */
export function useMobileTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return MOBILE_TAB_BASE_HEIGHT + Math.max(insets.bottom, 8);
}

export function MobileTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const openAuthenticationGateway = useAuthenticationGateway();
  const { colorScheme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const isDark = colorScheme === "dark";
  const navigationColors = floatingNavigationColors(isDark);
  const [itemsWidth, setItemsWidth] = useState(0);
  const orderedRoutes = useMemo(
    () => state.routes.filter((route) => CUSTOMER_TAB_ROUTES.has(route.name)),
    [state.routes],
  );
  const activeRouteName = state.routes[state.index]?.name;
  const selectedIndex = orderedRoutes.findIndex(
    (route) => route.name === activeRouteName,
  );
  const activeIndex = useSharedValue(selectedIndex);
  const centerIndex = orderedRoutes.findIndex((route) => route.name === CENTER_ROUTE);

  useEffect(() => {
    activeIndex.value = reducedMotion
      ? selectedIndex
      : withSpring(selectedIndex, { damping: 20, stiffness: 190, mass: 0.75 });
  }, [activeIndex, reducedMotion, selectedIndex]);

  const indicatorStyle = useAnimatedStyle<ViewStyle>(() => {
    const itemWidth = itemsWidth / TAB_COUNT;
    return {
      width: Math.max(0, itemWidth - 10),
      opacity: selectedIndex < 0
        ? 0
        : Math.min(1, Math.abs(activeIndex.value - centerIndex) * 2.5),
      transform: [{ translateX: activeIndex.value * itemWidth + 5 }],
    };
  }, [centerIndex, itemsWidth, selectedIndex]);

  const onItemsLayout = (event: LayoutChangeEvent) => {
    setItemsWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      // "navigation" is a valid ARIA landmark role on web but not a value
      // RCTView's native accessibilityRole enum accepts -- passing it on
      // Android/iOS crashes with "Invalid accessibility role value:
      // navigation". Restrict it to web; native platforms just skip the
      // role and keep the accessibilityLabel.
      accessibilityRole={Platform.OS === "web" ? ("navigation" as never) : undefined}
      accessibilityLabel="Main"
      style={[
        styles.safeWrap,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          paddingLeft: Math.max(insets.left, floatingNavigationTokens.horizontalInset),
          paddingRight: Math.max(insets.right, floatingNavigationTokens.horizontalInset),
          backgroundColor: navigationColors.canvas,
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: navigationColors.surface,
            borderColor: navigationColors.border,
          },
        ]}
      >
        <View style={styles.items} onLayout={onItemsLayout}>
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

          {orderedRoutes.map((route) => {
            const { options } = descriptors[route.key];
            const focused = state.routes[state.index]?.key === route.key;
            const label = typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : options.title ?? route.name;

            const onPress = () => {
              if (route.name === "profile") {
                void openAuthenticationGateway();
                return;
              }
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <AnimatedTab
                key={route.key}
                routeName={route.name}
                label={label}
                focused={focused}
                isDark={isDark}
                reducedMotion={reducedMotion}
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                accessibilityLabel={options.tabBarAccessibilityLabel || label}
                testID={options.tabBarButtonTestID}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

type StandaloneMobileTabBarProps = {
  activeRoute?: (typeof STANDALONE_TABS)[number]["routeName"];
};

/**
 * Displays the same customer navigation on screens that intentionally live
 * outside the Expo Router Tabs group, such as vendor listings and profiles.
 */
export function StandaloneMobileTabBar({
  activeRoute = "Categories",
}: StandaloneMobileTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openAuthenticationGateway = useAuthenticationGateway();
  const { colorScheme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const isDark = colorScheme === "dark";
  const navigationColors = floatingNavigationColors(isDark);
  const [itemsWidth, setItemsWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    STANDALONE_TABS.findIndex((tab) => tab.routeName === activeRoute),
  );
  const activeIndex = useSharedValue(selectedIndex);

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

  return (
    <View
      // See the identical comment on the other instance of this pattern
      // above: "navigation" crashes RCTView's native accessibilityRole
      // validation on Android/iOS, so it's web-only.
      accessibilityRole={Platform.OS === "web" ? ("navigation" as never) : undefined}
      accessibilityLabel="Main"
      style={[
        styles.safeWrap,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          paddingLeft: Math.max(insets.left, floatingNavigationTokens.horizontalInset),
          paddingRight: Math.max(insets.right, floatingNavigationTokens.horizontalInset),
          backgroundColor: navigationColors.canvas,
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: navigationColors.surface,
            borderColor: navigationColors.border,
          },
        ]}
      >
        <View
          style={styles.items}
          onLayout={(event) => setItemsWidth(event.nativeEvent.layout.width)}
        >
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

          {STANDALONE_TABS.map((tab) => (
            <AnimatedTab
              key={tab.routeName}
              routeName={tab.routeName}
              label={tab.label}
              focused={tab.routeName === activeRoute}
              isDark={isDark}
              reducedMotion={reducedMotion}
              onPress={() => {
                if (tab.routeName === activeRoute) return;
                if (tab.routeName === "profile") {
                  void openAuthenticationGateway();
                  return;
                }
                router.replace(tab.href);
              }}
              onLongPress={() => undefined}
              accessibilityLabel={tab.label}
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
    paddingHorizontal: floatingNavigationTokens.horizontalInset,
  },
  bar: {
    width: "100%",
    maxWidth: floatingNavigationTokens.tabletMaxWidth,
    alignSelf: "center",
    minHeight: PUBLIC_TAB_BASE_HEIGHT,
    borderWidth: 1,
    borderRadius: floatingNavigationTokens.barRadius,
    overflow: "visible",
    shadowColor: floatingNavigationTokens.shadow,
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  items: {
    minHeight: PUBLIC_TAB_BASE_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    top: floatingNavigationTokens.indicatorInset,
    bottom: floatingNavigationTokens.indicatorInset,
    borderRadius: floatingNavigationTokens.indicatorRadius,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: 2,
  },
  regularVisual: {
    width: 32,
    height: 29,
    marginTop: 5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  favoritePulse: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: floatingNavigationTokens.customerTabs.light.active,
  },
  homeVisual: {
    width: 40,
    height: 37,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  homeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: brandPalette.light.primaryForeground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: floatingNavigationTokens.customerTabs.light.active,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  label: {
    width: "100%",
    marginTop: 0,
    paddingHorizontal: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    textAlign: "center",
    includeFontPadding: false,
  },
  homeLabel: {
    marginTop: 0,
  },
  activeLabel: {
    fontWeight: "700",
  },
});
