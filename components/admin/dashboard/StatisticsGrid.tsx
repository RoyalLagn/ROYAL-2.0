import React from "react";
import { Pressable, Text, View } from "react-native";
import { Href, useRouter } from "expo-router";
import {
  Building2, CheckCircle2, Clock3, Folder, MessageSquare,
  Star, UserPlus, Users, XCircle,
} from "lucide-react-native";
import type { DashboardStatistics } from "@/types/adminDashboard";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { typeStyles } from "@/constants/typography";

type MetricKey = keyof DashboardStatistics;

type MetricDefinition = {
  key: MetricKey;
  label: string;
  compactLabel?: string;
  icon: React.ElementType;
  route: Href;
  tone?: "brand" | "success" | "warning" | "danger";
  supportingText?: (statistics: DashboardStatistics) => string;
};

const platformMetrics: MetricDefinition[] = [
  { key: "publicUsers", label: "Public users", compactLabel: "Users", icon: Users, route: "/AdminUsers", supportingText: (s) => `${s.todayPublicRegistrations.toLocaleString()} joined today` },
  { key: "totalVendors", label: "Vendors", icon: Building2, route: "/vendors-admin-listing", supportingText: (s) => `${s.todayVendorRegistrations.toLocaleString()} joined today` },
  { key: "categories", label: "Categories", icon: Folder, route: "/AdminCategories", supportingText: () => "Total categories" },
  { key: "reviews", label: "Reviews", icon: MessageSquare, route: "/AdminReviews", supportingText: (s) => `${s.todayReviews.toLocaleString()} added today` },
  { key: "averageRating", label: "Average rating", compactLabel: "Avg. rating", icon: Star, route: "/AdminReviews", supportingText: () => "Across all reviews" },
];

const workflowMetrics: MetricDefinition[] = [
  { key: "pendingApplications", label: "Pending review", icon: Clock3, route: "/VendorApplications", tone: "warning", supportingText: () => "Awaiting a decision" },
  { key: "todayApprovals", label: "Approved today", icon: CheckCircle2, route: "/vendors-admin-listing", tone: "success", supportingText: () => "Vendor applications" },
  { key: "todayRejections", label: "Rejected today", icon: XCircle, route: "/VendorApplications", tone: "danger", supportingText: () => "Vendor applications" },
];

const growthMetrics: MetricDefinition[] = [
  { key: "todayPublicRegistrations", label: "New users", icon: UserPlus, route: "/AdminUsers", tone: "success", supportingText: () => "Registered today" },
  { key: "todayVendorRegistrations", label: "New vendors", icon: Building2, route: "/VendorApplications", tone: "success", supportingText: () => "Registered today" },
];

const toneStyles = {
  brand: { icon: "bg-primary/10", iconText: "text-primary" },
  success: { icon: "bg-emerald-500/10", iconText: "text-emerald-600 dark:text-emerald-400" },
  warning: { icon: "bg-amber-500/10", iconText: "text-amber-700 dark:text-amber-400" },
  danger: { icon: "bg-red-500/10", iconText: "text-red-600 dark:text-red-400" },
} as const;

function MetricTile({ definition, statistics }: { definition: MetricDefinition; statistics: DashboardStatistics }) {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  const Icon = definition.icon;
  const tone = toneStyles[definition.tone ?? "brand"];
  const value = statistics[definition.key];
  const formattedValue = definition.key === "averageRating" ? Number(value).toFixed(2) : Number(value).toLocaleString();

  return (
    <Pressable
      className="min-h-11 rounded-xl border border-border bg-card active:bg-muted/60"
      style={({ pressed }) => [{ minHeight: responsive.isPhone ? 124 : 140, padding: responsive.isPhone ? 12 : 16 }, pressed ? { transform: [{ scale: 0.97 }] } : null]}
      onPress={() => router.push(definition.route)}
      accessibilityRole="button"
      accessibilityLabel={`${definition.label}: ${formattedValue}`}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <View className={`w-12 h-12 rounded-xl items-center justify-center ${tone.icon}`}>
          <Icon size={23} className={tone.iconText} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-muted-foreground" style={typeStyles.label} numberOfLines={1}>
            {responsive.isPhone && definition.compactLabel ? definition.compactLabel : definition.label}
          </Text>
          <Text className="text-foreground mt-1.5" style={typeStyles.metric} numberOfLines={1} adjustsFontSizeToFit>
            {formattedValue}
          </Text>
          {definition.supportingText ? (
            <Text className="text-muted-foreground mt-1.5" style={typeStyles.metadata} numberOfLines={1}>
              {definition.supportingText(statistics)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function StatisticsGrid({ statistics }: { statistics: DashboardStatistics; updatedAt?: number }) {
  const responsive = useResponsiveLayout();
  const columns = responsive.isPhone ? 2 : responsive.isTablet ? 3 : 5;
  const metrics = [...platformMetrics, ...workflowMetrics, ...growthMetrics];

  return (
    <ResponsiveGrid columns={columns} gap={responsive.isPhone ? 10 : 16}>
      {metrics.map((definition) => <MetricTile key={definition.key} definition={definition} statistics={statistics} />)}
    </ResponsiveGrid>
  );
}
