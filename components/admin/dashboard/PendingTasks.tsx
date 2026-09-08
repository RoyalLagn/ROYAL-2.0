import React from "react";
import { Pressable, Text, View } from "react-native";
import { Href, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { DashboardStatistics } from "@/types/adminDashboard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { typeStyles } from "@/constants/typography";
import { royalAdmin } from "@/components/admin/dashboard/adminDashboardTheme";

export function PendingTasks({ statistics, royal = false }: { statistics: DashboardStatistics; royal?: boolean }) {
  const router = useRouter();
  const { isPhone } = useResponsiveLayout();
  const tasks = [
    ["Pending Vendor Applications", statistics.pendingApplications, "High", "/VendorApplications"],
    ["Vendor Account Deletion Requests", statistics.pendingVendorDeletionRequests, "High", "/AdminVendorDeletionRequests"],
  ] as const;
  return (
    <View className={royal ? undefined : "rounded-xl border border-border bg-background overflow-hidden"} style={royal ? { borderRadius: 13, borderWidth: 1, borderColor: royalAdmin.border, backgroundColor: "#F8FBFF", overflow: "hidden" } : undefined}>
      {tasks.map(([task, count, priority, route], index) => {
        const tone = priority === "High" ? "bg-red-500/10 text-red-500" : priority === "Healthy" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500";
        const [badgeBg, badgeText] = tone.split(" ");
        return (
          <View key={task} className={`${isPhone ? "px-3.5 py-3.5" : "px-5 py-4"} flex-row items-center`} style={index ? { borderTopWidth: 1, borderTopColor: royalAdmin.border } : undefined}>
            <View className="flex-1 min-w-0 mr-3">
              <Text className={royal ? undefined : "text-foreground font-inter-semibold text-body"} style={royal ? { color: royalAdmin.navyDeep, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 20 } : undefined} numberOfLines={2}>{task}</Text>
              <View className={`self-start px-2 py-0.5 rounded-full mt-1.5 ${badgeBg}`}>
                <Text className={`text-caption font-inter-semibold ${badgeText}`}>{priority}</Text>
              </View>
            </View>
            <Text className={`${isPhone ? "mx-1" : "mr-2"} ${royal ? "" : "text-foreground"}`} style={[typeStyles.metric, royal && { color: royalAdmin.navyDeep }]}>{count}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${task}`} className="min-w-11 min-h-11 px-2 rounded-xl flex-row items-center justify-center" style={({ pressed }) => ({ transitionProperty: "transform, background-color", transitionDuration: "160ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", ...(pressed ? { transform: [{ scale: 0.97 }], backgroundColor: royalAdmin.bluePressed } : {}) } as any)} onPress={() => router.push(route as Href)}>
              <Text className={royal ? undefined : "text-primary text-button font-inter-bold mr-1"} style={royal ? { color: royalAdmin.blue, fontFamily: "Inter_700Bold", fontSize: 13, marginRight: 4 } : undefined}>Open</Text><ChevronRight size={15} color={royal ? royalAdmin.blue : undefined} className={royal ? undefined : "text-primary"} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
