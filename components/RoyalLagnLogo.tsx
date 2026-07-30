import React from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useAppTheme } from "@/components/ThemeProvider";

type RoyalLagnLogoProps = {
  width?: number;
  height?: number;
  scale?: number;
  style?: StyleProp<ViewStyle>;
};

export default function RoyalLagnLogo({
  width = 168,
  height = 46,
  scale = 1.85,
  style,
}: RoyalLagnLogoProps) {
  const { colorScheme } = useAppTheme();
  return (
    <View style={[styles.crop, { width, height }, style]}>
      <Image
        accessible
        accessibilityLabel="RoyalLagn Wedding Planner"
        source={colorScheme === "dark"
          ? require("../assets/Logo/center-logo.png")
          : require("../assets/Logo/light-logo.png")}
        resizeMode="contain"
        style={[styles.image, { transform: [{ scale }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  crop: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
});
