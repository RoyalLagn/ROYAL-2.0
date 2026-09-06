import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Crown } from "lucide-react-native";
import Animated, { Extrapolation, interpolate, type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { typeLeading, typeScale, typeStyles } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

type CategoryPageHeaderProps = {
  dark: boolean;
  title?: string;
  entrance?: SharedValue<number>;
  reducedMotion?: boolean;
};

function CategoryPageHeader({ dark, title = "All Categories", entrance, reducedMotion = false }: CategoryPageHeaderProps) {
  const text = dark ? "#F8F2F5" : "#15111E";
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
      <View pointerEvents="none" style={styles.titleBlock}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Animated.View style={[styles.ornament, ornamentStyle]}>
          <View style={styles.line} />
          <Crown size={14} color={PINK} strokeWidth={1.7} />
          <View style={styles.line} />
        </Animated.View>
      </View>

    </View>
  );
}

export default React.memo(CategoryPageHeader);

const styles = StyleSheet.create({
  header: { minHeight: 58, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 12 },
  title: {
    ...typeStyles.editorialPageTitle,
    fontSize: typeScale.editorialCardTitle,
    lineHeight: typeLeading.editorialCardTitle,
    textAlign: "center",
  },
  ornament: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 7 },
  line: { width: 30, height: 1, backgroundColor: "#E9B65C" },
});
