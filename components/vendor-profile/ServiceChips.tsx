import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Sparkles, type LucideIcon } from "lucide-react-native";
import { typeScale, typeLeading } from "@/constants/typography";

const PINK = "#E91E63";

export type VendorService = {
  id?: string;
  label: string;
  icon?: LucideIcon;
};

export type ServiceChipsProps = {
  services: (string | VendorService)[];
  dark?: boolean;
  onPress?: (service: VendorService, index: number) => void;
  accessibilityLabel?: string;
};

export default function ServiceChips({
  services,
  dark = false,
  onPress,
  accessibilityLabel = "Vendor services",
}: ServiceChipsProps) {
  const { width } = useWindowDimensions();
  const chipWidth = width >= 900 ? "31.5%" : undefined;
  const border = "transparent";
  const surface = dark ? "#24202A" : "#FFF2F6";
  const text = dark ? "#F2D6E0" : "#742B46";
  const normalized = services.map((service) =>
    typeof service === "string" ? { label: service } : service
  );

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.grid}>
      {normalized.map((service, index) => {
        const Icon = service.icon ?? Sparkles;
        const key = service.id ?? `${service.label}-${index}`;

        return (
          <Pressable
            key={key}
            accessibilityRole={onPress ? "button" : "text"}
            accessibilityLabel={service.label}
            disabled={!onPress}
            onPress={() => onPress?.(service, index)}
            style={({ pressed, hovered }) => [
              styles.chip,
              { width: chipWidth },
              { backgroundColor: surface, borderColor: border },
              hovered && onPress && Platform.OS === "web" && styles.hovered,
              pressed && onPress && styles.pressed,
            ]}
          >
            <Icon size={16} strokeWidth={1.7} color={dark ? "#FF76A5" : PINK} />
            <Text numberOfLines={2} style={[styles.label, { color: text }]}>
              {service.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    minHeight: 40,
    borderWidth: 0,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 7,
  },
  hovered: {
    backgroundColor: "#FFF2F6",
    transform: [{ translateY: -1 }],
    shadowColor: "#B84E73",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  label: {
    flexShrink: 1,
    textAlign: "left",
    fontSize: typeScale.metadata,
    lineHeight: typeLeading.metadata,
    fontWeight: "600",
  },
});
