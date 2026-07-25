import React from "react";
import { Platform, Pressable, StyleSheet, TextInput, type ViewStyle, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

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
  const text = dark ? "#F8F2F5" : "#2A2026";
  const muted = dark ? "#B9AEB3" : "#858087";
  const icon = dark ? "#D39AAA" : "#B86F7E";
  const border = dark ? "#4A363E" : "#F4DCE4";
  const gradient = dark
    ? ["#252124", "#2A2226"] as const
    : ["#FFFFFF", "#FFF5F8"] as const;

  return (
    <View style={[styles.shell, { backgroundColor: dark ? "#251F22" : "#FFF9FB", borderColor: border }, style]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.inner, { borderColor: dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.96)" }]}
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
              hovered && Platform.OS === "web" && { backgroundColor: dark ? "#3A3035" : "#FCEBF1" },
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
    borderRadius: 26,
    padding: 3,
    shadowColor: "#E8A8BB",
    shadowOpacity: 0.28,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  inner: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 22,
    paddingLeft: 20,
    paddingRight: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 0, fontSize: 14, fontWeight: "400", outlineStyle: "none" } as never,
  clear: { width: 30, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
