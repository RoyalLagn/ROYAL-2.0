import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronDown } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import type { VendorBooking } from "@/services/vendorBookings";

export interface MonthData {
  month: string;
  value: number;
  isPeak?: boolean;
}

export interface VendorCrmBookingsChartProps {
  bookings?: VendorBooking[];
  data?: MonthData[];
}

export default function VendorCrmBookingsChart({
  bookings,
  data: propData,
}: VendorCrmBookingsChartProps = {}) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const [filterPeriod, setFilterPeriod] = useState("Last 6 Months");

  const data: MonthData[] = useMemo(() => {
    if (propData && propData.length > 0) return propData;

    const months: MonthData[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString("en-US", { month: "short" });
      const year = d.getFullYear();
      const monthIndex = d.getMonth();

      let count = 0;
      if (Array.isArray(bookings)) {
        count = bookings.filter((b) => {
          if (!b.event_date && !b.created_at) return false;
          const bDate = new Date(b.event_date || b.created_at);
          return (
            !isNaN(bDate.getTime()) &&
            bDate.getFullYear() === year &&
            bDate.getMonth() === monthIndex &&
            b.booking_status !== "cancelled" &&
            b.booking_status !== "cancelled_by_vendor" &&
            b.booking_status !== "cancelled_by_customer"
          );
        }).length;
      }

      months.push({
        month: monthLabel,
        value: count,
      });
    }

    const maxVal = Math.max(...months.map((m) => m.value), 0);
    if (maxVal > 0) {
      const peakIdx = months.findIndex((m) => m.value === maxVal);
      if (peakIdx >= 0) months[peakIdx].isPeak = true;
    }

    return months;
  }, [bookings, propData]);

  const peakValue = Math.max(...data.map((d) => d.value), 0);
  const maxValue = peakValue <= 5 ? 5 : peakValue <= 10 ? 10 : peakValue <= 20 ? 20 : Math.ceil(peakValue / 5) * 5;
  const yTicks = [
    maxValue,
    Math.round(maxValue * 0.75),
    Math.round(maxValue * 0.5),
    Math.round(maxValue * 0.25),
    0,
  ];

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text numberOfLines={1} style={[styles.title, isDark && styles.textDark, styles.titleFlex]}>
          Bookings Overview
        </Text>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.filterPill,
            isDark && styles.filterPillDark,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={[styles.filterText, isDark && styles.textDark]}>
            {filterPeriod}
          </Text>
          <ChevronDown size={13} color={isDark ? "#9CA3AF" : "#6B7280"} />
        </Pressable>
      </View>

      {/* Chart Canvas */}
      <View style={styles.chartArea}>
        {/* Y Axis Ticks */}
        <View style={styles.yAxisCol}>
          {yTicks.map((tick) => (
            <Text key={tick} style={[styles.yTickText, isDark && styles.textMutedDark]}>
              {tick}
            </Text>
          ))}
        </View>

        {/* Bars and Gridlines */}
        <View style={styles.plotArea}>
          {/* Horizontal Grid lines */}
          <View style={styles.gridLinesWrap}>
            {yTicks.map((tick, idx) => (
              <View
                key={tick}
                style={[
                  styles.gridLine,
                  idx === yTicks.length - 1 && styles.gridLineBase,
                  isDark && styles.gridLineDark,
                ]}
              />
            ))}
          </View>

          {/* Bars Column Container */}
          <View style={styles.barsRow}>
            {data.map((item) => {
              const heightPercent = (item.value / maxValue) * 100;

              return (
                <View key={item.month} style={styles.barCol}>
                  {/* Tooltip on peak bar */}
                  {item.isPeak && item.value > 0 ? (
                    <View style={styles.tooltipWrap}>
                      <View style={styles.tooltipBox}>
                        <Text numberOfLines={1} style={styles.tooltipText}>{item.value} {item.value === 1 ? "Booking" : "Bookings"}</Text>
                      </View>
                      <View style={styles.tooltipPin} />
                    </View>
                  ) : null}

                  {/* The Bar */}
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${heightPercent}%` },
                        item.isPeak && styles.barFillPeak,
                      ]}
                    />
                  </View>

                  {/* X Axis Month Label */}
                  <Text style={[styles.xMonthText, isDark && styles.textMutedDark]}>
                    {item.month}
                  </Text>
                </View>
              );
            })}
          </View>
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
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box" as any,
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  titleFlex: {
    flex: 1,
    minWidth: 0,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  filterPillDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  filterText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
  },
  chartArea: {
    flexDirection: "row",
    flex: 1,
    alignItems: "stretch",
    paddingBottom: 4,
    minWidth: 0,
  },
  yAxisCol: {
    justifyContent: "space-between",
    paddingRight: 8,
    paddingBottom: 22,
    alignItems: "flex-end",
  },
  yTickText: {
    fontSize: 10,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  plotArea: {
    flex: 1,
    minWidth: 0,
    position: "relative",
    justifyContent: "flex-end",
  },
  gridLinesWrap: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    bottom: 22,
    justifyContent: "space-between",
  },
  gridLine: {
    height: 1,
    backgroundColor: "#F3F4F6",
    width: "100%",
  },
  gridLineBase: {
    backgroundColor: "#E5E7EB",
  },
  gridLineDark: {
    backgroundColor: "#374151",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 140,
    zIndex: 2,
    minWidth: 0,
  },
  barCol: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    height: "100%",
    justifyContent: "flex-end",
  },
  barTrack: {
    width: "62%",
    maxWidth: 28,
    height: 110,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: {
    width: "100%",
    backgroundColor: "#FBCFE8",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barFillPeak: {
    backgroundColor: "#F472B6",
  },
  xMonthText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 8,
  },
  tooltipWrap: {
    position: "absolute",
    top: 2,
    alignItems: "center",
    zIndex: 10,
    maxWidth: "100%",
  },
  tooltipBox: {
    backgroundColor: "#E91E63",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tooltipText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
  },
  tooltipPin: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#E91E63",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedDark: {
    color: "#9CA3AF",
  },
});
