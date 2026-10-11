import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronDown } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface MonthData {
  month: string;
  value: number;
  isPeak?: boolean;
}

export default function VendorCrmBookingsChart() {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const [filterPeriod, setFilterPeriod] = useState("Last 6 Months");

  const data: MonthData[] = [
    { month: "Apr", value: 7 },
    { month: "May", value: 7 },
    { month: "Jun", value: 10 },
    { month: "Jul", value: 15, isPeak: true },
    { month: "Aug", value: 10 },
    { month: "Sep", value: 13 },
  ];

  const maxValue = 20;
  const yTicks = [20, 15, 10, 5, 0];

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, isDark && styles.textDark]}>
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
                  {item.isPeak ? (
                    <View style={styles.tooltipWrap}>
                      <View style={styles.tooltipBox}>
                        <Text style={styles.tooltipText}>{item.value} Bookings</Text>
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
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
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
  },
  barCol: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  barTrack: {
    width: 28,
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
