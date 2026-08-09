import React from "react";
import { Pressable, Text, View } from "react-native";
import { Href, useRouter } from "expo-router";
import {
  Building2, CheckCircle2, Clock3, Folder, MessageSquare,
  Star, UserPlus, Users, XCircle,
} from "lucide-react-native";
import type { DashboardStatistics } from "@/types/adminDashboard";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
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

export function StatisticsGrid({ statistics, updatedAt }: { statistics: DashboardStatistics; updatedAt: number }) {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  return (
    <ResponsiveGrid gap={responsive.isPhone ? 10 : 12}>
      {definitions.map(([key, title, mobileTitle, Icon, route]) => (
        <Pressable
          key={key}
          className="min-h-11"
          onPress={() => router.push(route as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${statistics[key]}`}
        >
          <ResponsiveCard
            style={responsive.isPhone ? { padding: 12 } : undefined}
          >
            <View className="min-w-9 min-h-9 w-9 h-9 self-start rounded-lg bg-primary/10 items-center justify-center mb-2.5">
              <Icon size={responsive.iconSize - 2} className="text-primary" />
            </View>
            <Text className="text-muted-foreground font-inter-medium" style={typeStyles.bodyCompact} numberOfLines={1} ellipsizeMode="tail">
              {responsive.isPhone ? mobileTitle : title}
            </Text>
            <Text
              className="text-foreground font-inter-bold mt-0.5"
              style={typeStyles.metric}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {key === "averageRating"
                ? statistics[key].toFixed(2)
                : statistics[key].toLocaleString()}
            </Text>
            <Text className="text-emerald-600 dark:text-emerald-500 text-caption font-inter-medium mt-1.5" numberOfLines={1}>
              {key.startsWith("today") ? "Today" : `↑ ${key === "publicUsers" ? statistics.todayPublicRegistrations : key === "totalVendors" ? statistics.todayVendorRegistrations : key === "reviews" ? statistics.todayReviews : 0} today`}
            </Text>
            {!responsive.isPhone ? (
              <Text className="text-muted-foreground text-metadata mt-1" numberOfLines={1}>
                Updated {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            ) : null}
          </ResponsiveCard>
        </Pressable>
      ))}
    </ResponsiveGrid>
  );
}
