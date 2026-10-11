import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import {
  isVendorSectionActive,
  vendorProfileSections,
} from "@/vendor/navigation";

type Props = {
  /** Called when the tab for the page already on screen is pressed. */
  onCurrentPress?: () => void;
};

export default function VendorProfileSectionTabs({ onCurrentPress }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const isDark = colorScheme === "dark";

  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {vendorProfileSections.map((section) => {
        const active = isVendorSectionActive(pathname, section.route);
        return (
          <Pressable
            key={section.id}
            accessibilityRole="tab"
            accessibilityLabel={section.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) {
                onCurrentPress?.();
                return;
              }
              router.push(section.route as never);
            }}
            style={({ pressed, hovered }: any) => [
              styles.tab,
              {
                backgroundColor: active ? colors.pink : isDark ? "#1F2937" : "#FFFFFF",
                borderColor: active ? colors.pink : isDark ? "#374151" : "#FBCFE8",
              },
              !active && hovered && styles.tabHovered,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? "#FFFFFF" : isDark ? "#F9FAFB" : "#4B5563" },
              ]}
            >
              {section.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  tab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tabHovered: {
    backgroundColor: "#FFF1F5",
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
});
