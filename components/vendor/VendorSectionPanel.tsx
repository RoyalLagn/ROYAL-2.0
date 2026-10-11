import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale } from "@/constants/typography";

type Icon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export function VendorSectionPanel({
  backgroundColor,
  borderColor,
  children,
}: {
  backgroundColor: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return <View style={[styles.editor, { backgroundColor, borderColor }]}>{children}</View>;
}

export function VendorSectionGroup({
  icon: Icon,
  iconColor,
  title,
  detail,
  children,
}: {
  icon: Icon;
  iconColor: string;
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Icon size={18} color={iconColor} strokeWidth={2.1} />
        <Text style={[styles.groupTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {detail ? <Text style={[styles.groupDetail, { color: colors.muted }]}>{detail}</Text> : null}
      {children}
    </View>
  );
}

export function VendorSectionRule({ color }: { color: string }) {
  return <View style={[styles.rule, { backgroundColor: color }]} />;
}

export function VendorSectionChips({
  items,
  color,
}: {
  items: string[];
  color: string;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.chips}>
      {items.map((item) => (
        <Text key={item} style={[styles.chip, { color, backgroundColor: "rgba(255,255,255,0.72)" }]}>{item}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 4,
  },
  group: {
    paddingTop: 6,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  groupTitle: {
    fontSize: typeScale.cardTitle,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  groupDetail: {
    fontSize: typeScale.body,
    lineHeight: 21,
    marginBottom: 14,
    maxWidth: 560,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -4,
    marginBottom: 8,
  },
  chip: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: typeScale.caption,
    fontWeight: "700",
  },
});
