import React from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Wallet,
  XCircle,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface MetricItem {
  id: string;
  label: string;
  value: string;
  growth: string;
  route: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  growthColor?: string;
}

export interface VendorCrmMetricsGridProps {
  pendingBookings?: number;
  confirmedBookings?: number;
  cancelledBookings?: number;
  recentBookings?: number;
  totalBookings?: number;
  totalEarnings?: number | string;
}

export default function VendorCrmMetricsGrid({
  pendingBookings = 3,
  confirmedBookings = 7,
  cancelledBookings = 2,
  recentBookings = 5,
  totalBookings = 12,
  totalEarnings = "8,800",
}: VendorCrmMetricsGridProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 900;

  const formattedEarnings =
    typeof totalEarnings === "number"
      ? `₹ ${totalEarnings.toLocaleString("en-IN")}`
      : String(totalEarnings).startsWith("₹")
      ? totalEarnings
      : `₹ ${totalEarnings}`;

  const metrics: MetricItem[] = [
    {
      id: "pending",
      label: "New Pending Booking",
      value: String(pendingBookings),
      growth: pendingBookings > 0 ? "Action required" : "All cleared",
      route: "/VendorBookings?tab=pending",
      icon: Clock,
      iconBg: isDark ? "rgba(217, 119, 6, 0.15)" : "#FFFBEB",
      iconBorder: isDark ? "#78350F" : "#FEF3C7",
      iconColor: "#D97706",
      growthColor: pendingBookings > 0 ? "#D97706" : "#059669",
    },
    {
      id: "confirmed",
      label: "Confirmed Bookings",
      value: String(confirmedBookings),
      growth: "Upcoming events",
      route: "/VendorBookings?tab=confirmed",
      icon: CheckCircle2,
      iconBg: isDark ? "rgba(22, 163, 74, 0.15)" : "#ECFDF5",
      iconBorder: isDark ? "#14532D" : "#D1FAE5",
      iconColor: "#16A34A",
      growthColor: "#059669",
    },
    {
      id: "cancelled",
      label: "Cancelled Bookings",
      value: String(cancelledBookings),
      growth: "Past & rejected",
      route: "/VendorBookings?tab=cancelled",
      icon: XCircle,
      iconBg: isDark ? "rgba(220, 38, 38, 0.15)" : "#FEF2F2",
      iconBorder: isDark ? "#7F1D1D" : "#FEE2E2",
      iconColor: "#DC2626",
      growthColor: "#EF4444",
    },
    {
      id: "recent",
      label: "Recent Bookings",
      value: String(recentBookings),
      growth: "Last 30 days",
      route: "/VendorBookings",
      icon: CalendarDays,
      iconBg: isDark ? "rgba(124, 58, 237, 0.15)" : "#F5F3FF",
      iconBorder: isDark ? "#5B21B6" : "#EDE9FE",
      iconColor: "#7C3AED",
      growthColor: "#7C3AED",
    },
    {
      id: "total",
      label: "Total Bookings",
      value: String(totalBookings),
      growth: "All-time bookings",
      route: "/VendorBookings",
      icon: CalendarCheck,
      iconBg: isDark ? "rgba(233, 30, 99, 0.15)" : "#FDF2F8",
      iconBorder: isDark ? "#831843" : "#FCE7F3",
      iconColor: "#E91E63",
      growthColor: "#DB2777",
    },
    {
      id: "earnings",
      label: "Total Earnings",
      value: formattedEarnings,
      growth: "↑ 18% from last month",
      route: "/VendorPaymentHistory",
      icon: Wallet,
      iconBg: isDark ? "rgba(5, 150, 105, 0.15)" : "#ECFDF5",
      iconBorder: isDark ? "#064E3B" : "#A7F3D0",
      iconColor: "#059669",
      growthColor: "#059669",
    },
  ];

  return (
    <View style={[styles.grid, isDesktop ? styles.gridDesktop : styles.gridMobile]}>
      {metrics.map((item) => {
        const Icon = item.icon;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.value}`}
            onPress={() => router.push(item.route as any)}
            style={({ pressed, hovered }: any) => [
              styles.card,
              isDesktop ? styles.cardDesktop : styles.cardMobile,
              isDark && styles.cardDark,
              hovered && styles.cardHovered,
              pressed && { opacity: 0.85 },
            ]}
          >
            {/* Top Row: Icon badge + Chevron */}
            <View style={styles.topRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: item.iconBg,
                    borderColor: item.iconBorder,
                  },
                ]}
              >
                <Icon size={16} color={item.iconColor} strokeWidth={2.2} />
              </View>
              <ChevronRight size={15} color="#9CA3AF" />
            </View>

            {/* Metric Value */}
            <Text numberOfLines={1} style={[styles.value, isDark && styles.textDark]}>
              {item.value}
            </Text>

            {/* Metric Label */}
            <Text numberOfLines={1} style={[styles.label, isDark && styles.textDark]}>
              {item.label}
            </Text>

            {/* Growth / Subtitle Indicator */}
            <Text
              numberOfLines={1}
              style={[
                styles.growth,
                item.growthColor ? { color: item.growthColor } : null,
              ]}
            >
              {item.growth}
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
    maxWidth: "100%",
  },
  gridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 14,
    boxSizing: "border-box" as any,
  },
  cardDesktop: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 160,
  },
  cardMobile: {
    width: "48%",
    minWidth: 135,
    flexGrow: 1,
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  cardHovered: {
    borderColor: "#E91E63",
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  value: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#4B5563",
    marginBottom: 4,
  },
  growth: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#059669",
  },
  textDark: {
    color: "#F9FAFB",
  },
});
