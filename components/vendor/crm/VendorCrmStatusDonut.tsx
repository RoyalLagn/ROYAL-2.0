import React from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAppTheme } from "@/components/ThemeProvider";

export interface StatusSegment {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface VendorCrmStatusDonutProps {
  totalCount?: number;
  segments?: StatusSegment[];
}

export default function VendorCrmStatusDonut({
  totalCount = 42,
  segments = [
    { label: "Confirmed", count: 18, percentage: 43, color: "#E91E63" },
    { label: "Pending", count: 8, percentage: 19, color: "#FBCFE8" },
    { label: "Completed", count: 12, percentage: 29, color: "#10B981" },
    { label: "Cancelled", count: 4, percentage: 9, color: "#9CA3AF" },
  ],
}: VendorCrmStatusDonutProps) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.title, isDark && styles.textDark]}>
        Booking Status
      </Text>

      <View style={styles.bodyRow}>
        {/* Custom Donut Chart Ring */}
        <View style={styles.donutContainer}>
          {/* Outer Multi-color Ring */}
          <View style={styles.donutRing}>
            {/* 4 Colored Arcs via border styling */}
            <View style={[styles.arcSegment, styles.arcTopRight, { borderColor: "#E91E63" }]} />
            <View style={[styles.arcSegment, styles.arcBottomRight, { borderColor: "#FBCFE8" }]} />
            <View style={[styles.arcSegment, styles.arcBottomLeft, { borderColor: "#10B981" }]} />
            <View style={[styles.arcSegment, styles.arcTopLeft, { borderColor: "#9CA3AF" }]} />
          </View>

          {/* Donut Center Hole */}
          <View style={[styles.donutCenter, isDark && styles.donutCenterDark]}>
            <Text style={[styles.totalNumber, isDark && styles.textDark]}>
              {totalCount}
            </Text>
            <Text style={styles.totalLabel}>Total Bookings</Text>
          </View>
        </View>

        {/* Legend Column */}
        <View style={styles.legendCol}>
          {segments.map((seg) => (
            <View key={seg.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
              <Text numberOfLines={1} style={[styles.legendLabel, isDark && styles.textDark]}>
                {seg.label}
              </Text>
              <Text numberOfLines={1} style={[styles.legendVal, isDark && styles.textMutedDark]}>
                {seg.count} ({seg.percentage}%)
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 18,
    flex: 1,
    minHeight: 250,
    justifyContent: "space-between",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box" as any,
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    flex: 1,
    gap: 16,
    width: "100%",
    minWidth: 0,
  },
  donutContainer: {
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
  },
  donutRing: {
    width: 106,
    height: 106,
    borderRadius: 53,
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  arcSegment: {
    position: "absolute",
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 14,
  },
  arcTopRight: {
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
    transform: [{ rotate: "0deg" }],
  },
  arcBottomRight: {
    borderTopColor: "transparent",
    borderLeftColor: "transparent",
    transform: [{ rotate: "45deg" }],
  },
  arcBottomLeft: {
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "30deg" }],
  },
  arcTopLeft: {
    borderBottomColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "15deg" }],
  },
  donutCenter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  donutCenterDark: {
    backgroundColor: "#1F2937",
  },
  totalNumber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  totalLabel: {
    fontSize: 9,
    color: "#6B7280",
    fontWeight: "600",
  },
  legendCol: {
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#374151",
    flexShrink: 1,
  },
  legendVal: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
    flexShrink: 0,
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedDark: {
    color: "#9CA3AF",
  },
});
