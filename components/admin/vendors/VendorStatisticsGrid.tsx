import React from "react";
import { Pressable, Text, View } from "react-native";
import { Building2, CheckCircle2, Clock3, Crown, ShieldCheck, ShieldX, UserCheck, XCircle } from "lucide-react-native";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import type { VendorStatistics } from "@/types/adminVendors";

const items = [
  ["total", "Total", Building2],
  ["approved", "Approved", CheckCircle2],
  ["pending", "Pending", Clock3],
  ["rejected", "Rejected", XCircle],
  ["suspended", "Suspended", ShieldX],
  ["verified", "Verified", ShieldCheck],
  ["premium", "Premium", Crown],
  ["free", "Free", UserCheck],
  ["activeToday", "Active Today", UserCheck],
] as const;

const iconTones: Record<(typeof items)[number][0], string> = {
  total: "bg-primary/10",
  approved: "bg-emerald-500/10",
  pending: "bg-amber-500/10",
  rejected: "bg-red-500/10",
  suspended: "bg-red-500/10",
  verified: "bg-emerald-500/10",
  premium: "bg-primary/10",
  free: "bg-muted",
  activeToday: "bg-emerald-500/10",
};

const iconColors: Record<(typeof items)[number][0], string> = {
  total: "#E91E63",
  approved: "#059669",
  pending: "#B45309",
  rejected: "#DC2626",
  suspended: "#DC2626",
  verified: "#059669",
  premium: "#E91E63",
  free: "#6B7280",
  activeToday: "#059669",
};

export function VendorStatisticsGrid({
  data,
  activeKey,
  onSelect,
}: {
  data: VendorStatistics;
  activeKey?: (typeof items)[number][0] | null;
  onSelect?: (key: (typeof items)[number][0]) => void;
}) {
  const responsive = useResponsiveLayout();
  return (
    <ResponsiveGrid columns={responsive.breakpoint === "xs" ? 1 : responsive.isPhone ? 2 : 3} gap={responsive.isPhone ? 8 : 12}>
      {items.map(([key, label, Icon]) => {
        const isActive = activeKey === key;
        const content = (
          <View
            className={`rounded-xl border ${isActive ? "bg-primary/10 border-primary" : "bg-card border-border hover:border-primary/35 hover:bg-primary/5"} transition-colors duration-200`}
            style={{ minHeight: responsive.isPhone ? 86 : 96, padding: responsive.isPhone ? 12 : 14 }}
          >
            <View className="flex-row items-center gap-3 flex-1">
              <View className={`w-10 h-10 rounded-xl items-center justify-center ${isActive ? "bg-primary/20" : iconTones[key]}`}>
                <Icon size={responsive.iconSize - 2} color={isActive ? "#E91E63" : iconColors[key]} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-muted-foreground font-inter-medium text-body-compact" numberOfLines={1}>{label}</Text>
                <Text className="text-foreground font-inter-bold mt-1" style={{ fontSize: 20, lineHeight: 25 }}>{data[key].toLocaleString()}</Text>
              </View>
            </View>
          </View>
        );
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`Filter vendors by ${label}`}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            onPress={() => onSelect?.(key)}
          >
            {content}
          </Pressable>
        );
      })}
    </ResponsiveGrid>
  );
}
