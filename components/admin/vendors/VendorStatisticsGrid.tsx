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
        <ResponsiveCard key={key} className="bg-primary/5 border-primary/20" style={responsive.isPhone ? { padding: 12 } : undefined}>
          <View className="flex-row items-center justify-between">
            <Icon size={responsive.iconSize} className="text-primary" />
            <Text className="text-foreground text-xl font-bold">{data[key].toLocaleString()}</Text>
          </View>
          <Text className="text-muted-foreground text-xs mt-2" numberOfLines={1}>{label}</Text>
        </ResponsiveCard>
      ))}
    </ResponsiveGrid>
  );
}
