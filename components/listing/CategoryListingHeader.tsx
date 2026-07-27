import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, MapPin } from "lucide-react-native";

const PINK = "#E91E63";

type CategoryListingHeaderProps = {
  category: string;
  location: string;
  dark: boolean;
  onBack: () => void;
};

export default function CategoryListingHeader({
  category,
  location,
  dark,
  onBack,
}: CategoryListingHeaderProps) {
  const text = dark ? "#F8F2F5" : "#18111B";
  const hover = dark ? "#2B2427" : "#FFF0F5";

  const actionStyle = ({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
    styles.action,
    hovered && Platform.OS === "web" && { backgroundColor: hover },
    pressed && styles.pressed,
  ];

  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={actionStyle}>
        <ChevronLeft size={25} color={PINK} strokeWidth={2} />
      </Pressable>

      <View pointerEvents="none" style={styles.center}>
        <Text numberOfLines={1} style={[styles.title, { color: text }]}>{category}</Text>
        <View style={styles.location}>
          <MapPin size={13} color={PINK} strokeWidth={2} />
          <Text numberOfLines={1} style={styles.locationText}>{location}</Text>
        </View>
      </View>

      <View style={styles.action} />
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  header: { minHeight: 72, flexDirection: "row", alignItems: "center" },
  action: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.96 }] },
  center: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 6 },
  title: { maxWidth: "100%", fontFamily: serif, fontSize: 25, lineHeight: 30, fontWeight: "700", letterSpacing: -0.5 },
  location: { maxWidth: "100%", marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { flexShrink: 1, color: PINK, fontSize: 11, lineHeight: 15, fontWeight: "600" },
});
