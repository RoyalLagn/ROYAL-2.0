import React from "react";
import { Pressable, Text, View } from "react-native";
import { Href, useRouter } from "expo-router";
import type { DashboardHealth, DashboardStatistics } from "@/types/adminDashboard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function PendingTasks({ statistics, health }: { statistics: DashboardStatistics; health: DashboardHealth }) {
  const router = useRouter();
  const { isPhone } = useResponsiveLayout();
  const warnings = Object.entries(health).filter(([key, value]) => key !== "lastCheckedAt" && value === "unavailable").length;
  const tasks = [
    ["Pending Vendor Applications", statistics.pendingApplications, "High", "/VendorApplications"],
    ["Rejected Vendors Awaiting Resubmission", statistics.rejectedApplications, "Medium", "/VendorApplications"],
    ["Incomplete Vendor Profiles", statistics.incompleteVendorProfiles, "Medium", "/vendors-admin-listing"],
    ["Expired Subscriptions", statistics.expiredSubscriptions, "Medium", "/subscriptions-admin"],
    ["System Warnings", warnings, warnings ? "High" : "Healthy", "/AdminReports"],
  ] as const;
  return (
    <View className="gap-3">
      {tasks.map(([task, count, priority, route]) => (
        <View key={task} className={`bg-muted/50 rounded-2xl ${isPhone ? "p-3" : "p-4"} flex-row items-center`}>
          <View className="flex-1">
            <Text className="text-foreground font-semibold text-sm" numberOfLines={2}>{task}</Text>
            <Text className={`text-xs mt-1 ${priority === "High" ? "text-red-500" : priority === "Healthy" ? "text-emerald-500" : "text-amber-500"}`}>
              {priority} priority
            </Text>
          </View>
          <Text className={`text-foreground text-xl font-bold ${isPhone ? "mx-2" : "mr-4"}`}>{count}</Text>
          <Pressable className="bg-primary rounded-full min-w-11 min-h-11 px-3 items-center justify-center" onPress={() => router.push(route as Href)}>
            <Text className="text-white text-xs font-semibold">Open</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
