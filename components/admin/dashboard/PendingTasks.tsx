import React from "react";
import { Pressable, Text, View } from "react-native";
import { Href, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { DashboardStatistics } from "@/types/adminDashboard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { typeStyles } from "@/constants/typography";

export function PendingTasks({ statistics }: { statistics: DashboardStatistics }) {
  const router = useRouter();
  const { isPhone } = useResponsiveLayout();
  const tasks = [
    ["Pending Vendor Applications", statistics.pendingApplications, "High", "/VendorApplications"],
  ] as const;
  return (
    <View className="rounded-xl border border-border bg-background overflow-hidden">
      {tasks.map(([task, count, priority, route], index) => {
        const tone = priority === "High" ? "bg-red-500/10 text-red-500" : priority === "Healthy" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500";
        const [badgeBg, badgeText] = tone.split(" ");
        return (
          <View key={task} className={`${index ? "border-t border-border" : ""} ${isPhone ? "px-3.5 py-3.5" : "px-5 py-4"} flex-row items-center`}>
            <View className="flex-1 min-w-0 mr-3">
              <Text className="text-foreground font-inter-semibold text-body" numberOfLines={2}>{task}</Text>
              <View className={`self-start px-2 py-0.5 rounded-full mt-1.5 ${badgeBg}`}>
                <Text className={`text-caption font-inter-semibold ${badgeText}`}>{priority}</Text>
              </View>
            </View>
            <Text className={`text-foreground ${isPhone ? "mx-1" : "mr-2"}`} style={typeStyles.metric}>{count}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${task}`} className="min-w-11 min-h-11 px-2 rounded-xl flex-row items-center justify-center active:bg-primary/10" style={({ pressed }) => ({ transitionProperty: "transform, background-color", transitionDuration: "160ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", ...(pressed ? { transform: [{ scale: 0.97 }] } : {}) } as any)} onPress={() => router.push(route as Href)}>
              <Text className="text-primary text-button font-inter-bold mr-1">Open</Text><ChevronRight size={15} className="text-primary" />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
