import React from "react";
import { Text, View } from "react-native";
import { Building2, CheckCircle2, Clock3, Crown, ShieldCheck, ShieldX, UserCheck, XCircle } from "lucide-react-native";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
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
    <ResponsiveGrid columns={responsive.breakpoint === "xs" ? 1 : responsive.isPhone ? 2 : responsive.isTablet ? 3 : 5} gap={10}>
      {items.map(([key, label, Icon]) => (
        <ResponsiveCard key={key} style={responsive.isPhone ? { padding: 12 } : undefined}>
          <View className="flex-row items-center justify-between">
            <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
              <Icon size={responsive.iconSize - 4} className="text-primary" />
            </View>
            <Text className="text-foreground font-inter-bold" style={{ fontSize: 20, lineHeight: 25 }}>{data[key].toLocaleString()}</Text>
          </View>
          <Text className="text-muted-foreground font-inter-medium text-body-compact mt-2" numberOfLines={1}>{label}</Text>
        </ResponsiveCard>
      ))}
    </ResponsiveGrid>
  );
}
