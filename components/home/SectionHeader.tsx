import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

const PINK = "#E91E63";

type SectionHeaderProps = {
  title: string;
  dark: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  accessory?: ReactNode;
};

export default function SectionHeader({
  title,
  dark,
  actionLabel,
  onActionPress,
  accessory,
}: SectionHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headingBlock}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: dark ? "#F7F2F4" : "#111827" }]}>{title}</Text>
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
          <Text style={styles.actionText}>{actionLabel}</Text>
          <ChevronRight size={14} color={PINK} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

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
    fontFamily: "serif",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
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
    color: PINK,
    fontSize: 12,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.68,
  },
});
