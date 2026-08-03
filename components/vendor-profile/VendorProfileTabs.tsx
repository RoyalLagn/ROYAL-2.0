import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type VendorProfileTab = "portfolio" | "clips";

function VendorProfileTabs({
  selected,
  dark,
  onChange,
}: {
  selected: VendorProfileTab;
  dark: boolean;
  onChange: (tab: VendorProfileTab) => void;
}) {
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(selected === "clips" ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: selected === "clips" ? 1 : 0,
      duration: 275,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [progress, selected]);

  const indicatorWidth = Math.max(0, (width / 2) - 32);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width / 2],
  });

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => current === nextWidth ? current : nextWidth);
      }}
      style={[
        styles.container,
        {
          backgroundColor: dark ? "rgba(255,255,255,.035)" : "#FFF9FB",
          borderBottomColor: dark ? "#30242B" : "#F2E4E9",
        },
      ]}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: indicatorWidth,
              backgroundColor: dark ? "#FF5F94" : "#E91E63",
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}
      {(["portfolio", "clips"] as const).map((tab) => {
        const active = selected === tab;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={`${tab === "portfolio" ? "Portfolio" : "Clips"} tab`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab)}
            style={({ pressed, hovered }) => [
              styles.tab,
              Platform.OS === "web" && styles.tabWeb,
              pressed && styles.tabPressed,
              hovered && Platform.OS === "web" && styles.tabHovered,
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? "#E91E63" : dark ? "#D5C4CB" : "#79666E" },
                active && styles.labelActive,
              ]}
            >
              {tab === "portfolio" ? "Portfolio" : "Clips"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default React.memo(VendorProfileTabs);

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 46,
    marginTop: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  indicator: {
    position: "absolute",
    left: 16,
    bottom: 0,
    height: 2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    shadowColor: "#E91E63",
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
  },
  tab: {
    flex: 1,
    height: 46,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  tabWeb: { outlineStyle: "none" } as any,
  tabPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  tabHovered: { backgroundColor: "rgba(233,30,99,.035)" },
  label: { fontSize: 14, lineHeight: 19, fontWeight: "600", letterSpacing: 0.05 },
  labelActive: { fontWeight: "800" },
});
