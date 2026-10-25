import React from "react";
import { Text, View } from "react-native";
import type { DashboardHealth, DashboardStatistics } from "@/types/adminDashboard";

export function PriorityAlerts({ statistics, health }: { statistics: DashboardStatistics; health: DashboardHealth }) {
  const activeAlerts = [
    statistics.pendingApplications > 0
      ? ["Warning", `${statistics.pendingApplications} vendor approval${statistics.pendingApplications === 1 ? "" : "s"} waiting.`]
      : null,
    health.smtp === "unavailable" ? ["Warning", "SMTP health endpoint is unavailable."] : null,
    health.mediaStorage === "unavailable" ? ["Warning", "Cloudinary media configuration is missing."] : null,
    health.realtime === "unavailable" ? ["Critical", "Realtime is disconnected."] : null,
    health.database === "unavailable" ? ["Critical", "Database health check failed."] : null,
  ].filter(Boolean) as ["Critical" | "Warning", string][];
  const alerts: ["Critical" | "Warning" | "Healthy", string][] = activeAlerts.length
    ? activeAlerts
    : [["Healthy", "No active priority alerts."]];
  return (
    <View className="gap-3">
      {alerts.map(([severity, text]) => (
        <View key={text} className="bg-muted/50 rounded-2xl p-4 flex-row items-center">
          <View className={`w-2.5 h-2.5 rounded-full mr-3 ${severity === "Critical" ? "bg-red-500" : severity === "Warning" ? "bg-amber-500" : "bg-emerald-500"}`} />
          <Text className="text-foreground text-sm flex-1" numberOfLines={3}>{text}</Text>
          <Text className={`text-xs font-semibold ${severity === "Critical" ? "text-red-500" : severity === "Warning" ? "text-amber-500" : "text-emerald-500"}`}>{severity}</Text>
        </View>
      ))}
    </View>
  );
}
