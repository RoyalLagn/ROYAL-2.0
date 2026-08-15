import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, Crown } from "lucide-react-native";
import Animated, { Extrapolation, interpolate, type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { typeStyles } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

type CategoryPageHeaderProps = {
  dark: boolean;
  onBack: () => void;
  entrance?: SharedValue<number>;
  reducedMotion?: boolean;
};

function CategoryPageHeader({ dark, onBack, entrance, reducedMotion = false }: CategoryPageHeaderProps) {
  const text = dark ? "#F8F2F5" : "#15111E";
  const hover = dark ? "#2A2226" : "#FFF2F7";
  const ornamentStyle = useAnimatedStyle(() => ({
    opacity: entrance ? interpolate(entrance.value, [0.08, 0.38], [0, 1], Extrapolation.CLAMP) : 1,
    transform: [{
      scale: reducedMotion || !entrance
        ? 1
        : interpolate(entrance.value, [0.08, 0.38], [0.98, 1], Extrapolation.CLAMP),
    }],
  }), [entrance, reducedMotion]);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={({ pressed, hovered }) => [
          styles.action,
          hovered && Platform.OS === "web" && { backgroundColor: hover },
          pressed && styles.pressed,
        ]}
      >
        <ChevronLeft size={26} color={text} strokeWidth={2} />
      </Pressable>

      <View pointerEvents="none" style={styles.titleBlock}>
        <Text style={[styles.title, { color: text }]}>All Categories</Text>
        <Animated.View style={[styles.ornament, ornamentStyle]}>
          <View style={styles.line} />
          <Crown size={14} color={PINK} strokeWidth={1.7} />
          <View style={styles.line} />
        </Animated.View>
      </View>

      <View style={styles.action} />
    </View>
  );
}

export default React.memo(CategoryPageHeader);

const styles = StyleSheet.create({
  header: { minHeight: 86, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  action: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.97 }] },
  titleBlock: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 12 },
  title: {
    ...typeStyles.editorialPageTitle,
    textAlign: "center",
  },
  ornament: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 7 },
  line: { width: 30, height: 1, backgroundColor: "#E9B65C" },
});
