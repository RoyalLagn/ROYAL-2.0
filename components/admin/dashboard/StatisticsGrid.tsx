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

const definitions = [
  ["publicUsers", "Public Users", "Users", Users, "/AdminUsers"],
  ["totalVendors", "Total Vendors", "Vendors", Building2, "/vendors-admin-listing"],
  ["pendingApplications", "Pending Applications", "Pending", Clock3, "/VendorApplications"],
  ["todayApprovals", "Approved Today", "Approved", CheckCircle2, "/vendors-admin-listing"],
  ["todayRejections", "Rejected Today", "Rejected", XCircle, "/VendorApplications"],
  ["categories", "Categories", "Categories", Folder, "/AdminCategories"],
  ["reviews", "Reviews", "Reviews", MessageSquare, "/AdminReviews"],
  ["averageRating", "Average Rating", "Rating", Star, "/AdminReviews"],
  ["todayPublicRegistrations", "Today's New Users", "New Users", UserPlus, "/AdminUsers"],
  ["todayVendorRegistrations", "Today's New Vendors", "New Vendors", Building2, "/VendorApplications"],
] as const;

export function StatisticsGrid({ statistics }: { statistics: DashboardStatistics }) {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  return (
    <ResponsiveGrid columns={responsive.isPhone ? 2 : responsive.isTablet ? 3 : 5} gap={responsive.isPhone ? 8 : 10}>
      {definitions.map(([key, title, mobileTitle, Icon, route]) => {
        const todayValue = key === "publicUsers" ? statistics.todayPublicRegistrations : key === "totalVendors" ? statistics.todayVendorRegistrations : key === "reviews" ? statistics.todayReviews : 0;
        const todayLabel = key.startsWith("today") ? "Today" : `${todayValue.toLocaleString()} today`;
        return (
        <Pressable
          key={key}
          className="min-h-11 rounded-xl bg-muted/35 active:opacity-70"
          style={({ pressed }) => [{ padding: responsive.isPhone ? 12 : 14 }, pressed ? { transform: [{ scale: 0.98 }] } : null]}
          onPress={() => router.push(route as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${statistics[key]}`}
        >
          <View>
            <View className="flex-row items-start gap-2">
              <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
                <Icon size={16} className="text-primary" />
              </View>
              <Text
                className="text-foreground font-inter-bold flex-1 text-right"
                style={typeStyles.metric}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {key === "averageRating" ? statistics[key].toFixed(2) : statistics[key].toLocaleString()}
              </Text>
            </View>
            <Text className="text-muted-foreground font-inter-medium mt-3" style={typeStyles.bodyCompact} numberOfLines={1} ellipsizeMode="tail">
              {responsive.isPhone ? mobileTitle : title}
            </Text>
            <Text className={`${todayValue > 0 ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"} text-caption font-inter-medium mt-1`} numberOfLines={1}>
              {todayLabel}
            </Text>
          </View>
        </Pressable>
      );})}
    </ResponsiveGrid>
  );
}
