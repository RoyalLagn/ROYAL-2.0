import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/ThemeProvider";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";

export const MOBILE_TAB_BASE_HEIGHT = 49;

export function MobileTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const openAuthenticationGateway = useAuthenticationGateway();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const activeColor = isDark ? "#EC4899" : "#E91E63";
  const inactiveColor = isDark ? "#AAA0A5" : "#787178";
  const bottomInset = insets.bottom;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: isDark ? "#070B14" : "#FFF1FC",
          borderTopColor: isDark ? "#333333" : "#FBCFE8",
          paddingBottom: bottomInset,
        },
      ]}
    >
      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? activeColor : inactiveColor;
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

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.item,
                pressed ? styles.itemPressed : undefined,
              ]}
            >
              <View style={styles.iconWrap}>
                {options.tabBarIcon?.({
                  focused,
                  color,
                  size: 22,
                })}
              </View>
              <Text
                allowFontScaling
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.5}
                minimumFontScale={0.82}
                numberOfLines={2}
                style={[
                  styles.label,
                  {
                    color,
                    fontWeight: focused ? "600" : "500",
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 5,
    shadowColor: "#5E4751",
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -5 },
    elevation: 9,
  },
  items: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: MOBILE_TAB_BASE_HEIGHT - 5,
    paddingHorizontal: 2,
    paddingTop: 1,
    paddingBottom: 2,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  itemPressed: {
    opacity: 0.72,
  },
  iconWrap: {
    width: 28,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    width: "100%",
    marginTop: 1,
    paddingHorizontal: 1,
    fontSize: 11,
    lineHeight: 13,
    textAlign: "center",
    includeFontPadding: false,
  },
});
