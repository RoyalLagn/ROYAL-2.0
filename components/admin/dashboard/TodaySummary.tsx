import React from "react";
import { Text } from "react-native";
import type { DashboardStatistics } from "@/types/adminDashboard";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function TodaySummary({ data }: { data: DashboardStatistics }) {
  const responsive = useResponsiveLayout();
  const items = [
    ["Registrations", data.todayPublicRegistrations],
    ["Vendor Applications", data.todayApplications],
    ["Vendor Approvals", data.todayApprovals],
    ["Vendor Rejections", data.todayRejections],
    ["Reviews", data.todayReviews],
  ] as const;
  return (
    <ResponsiveGrid columns={responsive.breakpoint === "xs" ? 1 : responsive.isPhone ? 2 : responsive.isTablet ? 3 : 5} gap={responsive.isPhone ? 10 : 12}>
      {items.map(([label, value]) => (
        <ResponsiveCard key={label} className="bg-muted/60" style={responsive.isPhone ? { padding: 12 } : undefined}>
          <Text className="text-foreground text-xl font-bold">{value.toLocaleString()}</Text>
          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{label}</Text>
        </ResponsiveCard>
      ))}
    </ResponsiveGrid>
  );
}
