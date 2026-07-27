import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, Crown } from "lucide-react-native";

const PINK = "#E91E63";

type CategoryPageHeaderProps = {
  dark: boolean;
  onBack: () => void;
};

export default function CategoryPageHeader({ dark, onBack }: CategoryPageHeaderProps) {
  const text = dark ? "#F8F2F5" : "#15111E";
  const hover = dark ? "#2A2226" : "#FFF2F7";

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
        <View style={styles.ornament}>
          <View style={styles.line} />
          <Crown size={14} color={PINK} strokeWidth={1.7} />
          <View style={styles.line} />
        </View>
      </View>

      <View style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  action: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.97 }] },
  titleBlock: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 8 },
  title: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" }),
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.65,
    textAlign: "center",
  },
  ornament: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 6 },
  line: { width: 38, height: 1, backgroundColor: "#E9B65C" },
});
