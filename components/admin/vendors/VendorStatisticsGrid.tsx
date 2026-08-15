import React from "react";
import { Text, View } from "react-native";
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

export function VendorStatisticsGrid({ data }: { data: VendorStatistics }) {
  const responsive = useResponsiveLayout();
  return (
    <ResponsiveGrid columns={responsive.breakpoint === "xs" ? 1 : responsive.isPhone ? 2 : 3} gap={responsive.isPhone ? 8 : 12}>
      {items.map(([key, label, Icon]) => (
        <View key={key} className="rounded-xl bg-card border border-border" style={{ minHeight: responsive.isPhone ? 86 : 96, padding: responsive.isPhone ? 12 : 14 }}>
          <View className="flex-row items-center gap-3 flex-1">
            <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
              <Icon size={responsive.iconSize - 2} className="text-primary" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-muted-foreground font-inter-medium text-body-compact" numberOfLines={1}>{label}</Text>
              <Text className="text-foreground font-inter-bold mt-1" style={{ fontSize: 20, lineHeight: 25 }}>{data[key].toLocaleString()}</Text>
            </View>
          </View>
        </View>
      ))}
    </ResponsiveGrid>
  );
}
