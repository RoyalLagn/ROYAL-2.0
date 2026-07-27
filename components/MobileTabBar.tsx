import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Grid3X3, Heart, Home, MessageSquareText, User } from "lucide-react-native";
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
import { useAppTheme } from "@/components/ThemeProvider";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";

const PINK = "#E91E63";
const ACTIVE_DARK = "#EC4899";
const INACTIVE_LIGHT = "#6B6B73";
const INACTIVE_DARK = "#AAA0A5";
const HOME_ROUTE = "index";
const TAB_COUNT = 5;

const AnimatedGrid = Animated.createAnimatedComponent(Grid3X3);
const AnimatedHeart = Animated.createAnimatedComponent(Heart);
const AnimatedHome = Animated.createAnimatedComponent(Home);
const AnimatedMessage = Animated.createAnimatedComponent(MessageSquareText);
const AnimatedUser = Animated.createAnimatedComponent(User);

const ICONS: Record<string, React.ComponentType<any>> = {
  Categories: AnimatedGrid,
  favorites: AnimatedHeart,
  index: AnimatedHome,
  enquiry: AnimatedMessage,
  profile: AnimatedUser,
};

export const MOBILE_TAB_BASE_HEIGHT = 80;

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
  const isHome = routeName === HOME_ROUTE;
  const activeColor = isDark ? ACTIVE_DARK : PINK;
  const inactiveColor = isDark ? INACTIVE_DARK : INACTIVE_LIGHT;
  const Icon = ICONS[routeName] ?? AnimatedHome;

  useEffect(() => {
    active.value = reducedMotion
      ? (focused ? 1 : 0)
      : withSpring(focused ? 1 : 0, { damping: 18, stiffness: 210, mass: 0.7 });
  }, [active, focused, reducedMotion]);

  const visualStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [
      { translateY: isHome ? interpolate(active.value, [0, 1], [0, -2]) : interpolate(active.value, [0, 1], [0, -3]) },
      { scale: pressed.value * interpolate(active.value, [0, 1], [1, isHome ? 1.06 : 1.08]) },
    ],
  } as ViewStyle));

  const labelStyle = useAnimatedStyle<TextStyle>(() => ({
    color: interpolateColor(active.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const circleStyle = useAnimatedStyle<ViewStyle>(() => ({
    backgroundColor: interpolateColor(
      active.value,
      [0, 1],
      [isDark ? "#D92B69" : "#E93370", activeColor],
    ),
    shadowOpacity: interpolate(active.value, [0, 1], [0.2, 0.32]),
  }));

  const iconProps = useAnimatedProps(() => ({
    color: isHome
      ? "#FFFFFF"
      : interpolateColor(active.value, [0, 1], [inactiveColor, activeColor]),
    fill: routeName === "favorites" && active.value > 0.5 ? activeColor : "transparent",
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
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={styles.item}
    >
      {isHome ? (
        <Animated.View style={[styles.homeVisual, visualStyle]}>
          <Animated.View style={[styles.homeCircle, circleStyle]}>
            <Icon animatedProps={iconProps} size={20} strokeWidth={2.35} />
          </Animated.View>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.regularVisual, visualStyle]}>
          <Icon animatedProps={iconProps} size={21} strokeWidth={focused ? 2.35 : 2} />
        </Animated.View>
      )}
      <Animated.Text
        allowFontScaling
        maxFontSizeMultiplier={1.25}
        numberOfLines={1}
        style={[styles.label, isHome && styles.homeLabel, focused && styles.activeLabel, labelStyle]}
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
  return MOBILE_TAB_BASE_HEIGHT + insets.bottom;
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
  const [itemsWidth, setItemsWidth] = useState(0);
  const activeIndex = useSharedValue(state.index);
  const orderedRoutes = useMemo(() => state.routes, [state.routes]);
  const homeIndex = state.routes.findIndex((route) => route.name === HOME_ROUTE);

  useEffect(() => {
    activeIndex.value = reducedMotion
      ? state.index
      : withSpring(state.index, { damping: 20, stiffness: 190, mass: 0.75 });
  }, [activeIndex, reducedMotion, state.index]);

  const indicatorStyle = useAnimatedStyle<ViewStyle>(() => {
    const itemWidth = itemsWidth / TAB_COUNT;
    return {
      width: Math.max(0, itemWidth - 10),
      opacity: Math.min(1, Math.abs(activeIndex.value - homeIndex) * 2.5),
      transform: [{ translateX: activeIndex.value * itemWidth + 5 }],
    };
  }, [homeIndex, itemsWidth]);

  const onItemsLayout = (event: LayoutChangeEvent) => {
    setItemsWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      style={[
        styles.safeWrap,
        {
          paddingBottom: insets.bottom,
          backgroundColor: isDark ? "#070B14" : "#FFFFFF",
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: isDark ? "#0E141F" : "#FFFFFF",
            borderColor: isDark ? "#273248" : "#F4DCE5",
          },
        ]}
      >
        <View style={styles.items} onLayout={onItemsLayout}>
          {itemsWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeIndicator,
                { backgroundColor: isDark ? "rgba(236,72,153,.13)" : "#FFF0F6" },
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
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeWrap: {
    width: "100%",
    flexShrink: 0,
    paddingTop: 18,
    paddingHorizontal: 10,
  },
  bar: {
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 31,
    overflow: "visible",
    shadowColor: "#573341",
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  items: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "stretch",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    top: 5,
    bottom: 5,
    borderRadius: 25,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: 2,
  },
  regularVisual: {
    width: 34,
    height: 31,
    marginTop: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  homeVisual: {
    width: 44,
    height: 40,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  homeCircle: {
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
  label: {
    width: "100%",
    marginTop: 0,
    paddingHorizontal: 1,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "500",
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
