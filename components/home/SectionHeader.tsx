import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { brandColors } from "@/constants/brandPalette";
import { fonts } from "@/constants/typography";

type SectionHeaderProps = {
  title: string;
  dark: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  accessory?: ReactNode;
};

function SectionHeader({
  title,
  dark,
  actionLabel,
  onActionPress,
  accessory,
}: SectionHeaderProps) {
  const colors = brandColors(dark);

  return (
    <View style={styles.header}>
      <View style={styles.headingBlock}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: dark ? "#F7F2F4" : colors.foreground }]}>{title}</Text>
          {accessory}
        </View>
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${title}`}
          hitSlop={6}
          onPress={onActionPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[styles.actionText, { color: colors.primaryStrong }]}>{actionLabel}</Text>
          <ChevronRight size={14} color={colors.primaryStrong} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default React.memo(SectionHeader);

const styles = StyleSheet.create({
  header: {
    minHeight: 38,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headingBlock: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: "flex-start",
  },
  titleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.serif.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  action: {
    minHeight: 36,
    paddingHorizontal: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  actionText: {
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.68,
  },
});
