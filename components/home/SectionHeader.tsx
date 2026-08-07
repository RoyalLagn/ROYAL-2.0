import React, { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { brandColors } from "@/constants/brandPalette";
import { typeStyles } from "@/constants/typography";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  dark: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  accessory?: ReactNode;
};

function SectionHeader({
  title,
  subtitle,
  dark,
  actionLabel,
  onActionPress,
  accessory,
}: SectionHeaderProps) {
  const [actionFocused, setActionFocused] = useState(false);
  const colors = brandColors(dark);

  return (
    <View style={styles.header}>
      <View style={styles.headingBlock}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: dark ? "#F7F2F4" : colors.foreground }]}>{title}</Text>
          {accessory}
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${title}`}
          hitSlop={6}
          onPress={onActionPress}
          onHoverIn={() => setActionFocused(true)}
          onHoverOut={() => setActionFocused(false)}
          onFocus={() => setActionFocused(true)}
          onBlur={() => setActionFocused(false)}
          style={({ pressed }) => [
            styles.action,
            actionFocused && { backgroundColor: colors.muted },
            pressed && styles.pressed,
          ]}
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
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
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
    gap: 6,
  },
  title: {
    flexShrink: 1,
    ...typeStyles.editorialSectionTitle,
  },
  subtitle: {
    marginTop: 3,
    ...typeStyles.metadata,
  },
  action: {
    minHeight: 40,
    paddingHorizontal: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  actionText: {
    ...typeStyles.button,
  },
  pressed: {
    opacity: 0.68,
  },
});
