import React from "react";
import { Platform, Pressable, StyleSheet, TextInput, type ViewStyle, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale } from "@/constants/typography";

type CompactSearchBarProps = {
  value: string;
  placeholder: string;
  dark: boolean;
  accessibilityLabel: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  style?: ViewStyle;
};

export default function CompactSearchBar({
  value,
  placeholder,
  dark,
  accessibilityLabel,
  onChangeText,
  onSubmit,
  style,
}: CompactSearchBarProps) {
  const colors = brandColors(dark);
  const text = dark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const icon = colors.primary;
  const border = colors.border;
  const gradient = dark
    ? [colors.card, "#121A28"] as const
    : [colors.card, colors.background] as const;

  return (
    <View style={[styles.shell, { backgroundColor: colors.card, borderColor: border }, style]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.inner, { borderColor: dark ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.98)" }]}
      >
        <Search size={18} color={icon} strokeWidth={1.7} />
        <TextInput
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={muted}
          returnKeyType="search"
          style={[styles.input, { color: text }]}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => onChangeText("")}
            style={({ pressed, hovered }) => [
              styles.clear,
              hovered && Platform.OS === "web" && { backgroundColor: dark ? "#3A3035" : colors.muted },
              pressed && styles.pressed,
            ]}
          >
            <X size={15} color={muted} />
          </Pressable>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minWidth: 0,
    height: 58,
    borderWidth: 1,
    borderRadius: 28,
    padding: 2,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  inner: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: fonts.sans.regular,
    fontSize: typeScale.body,
    outlineStyle: "none",
  } as never,
  clear: { width: 30, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
