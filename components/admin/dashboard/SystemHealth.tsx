import React from "react";
import { Text, View } from "react-native";
import type { DashboardHealth } from "@/types/adminDashboard";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function SystemHealth({ health }: { health: DashboardHealth }) {
  const responsive = useResponsiveLayout();
  return (
    <View className="bg-card border border-border rounded-2xl p-4">
      <ResponsiveGrid columns={responsive.breakpoint === "xs" ? 1 : 2} gap={12}>
      {Object.entries(health).filter(([name]) => name !== "lastCheckedAt").map(([name, status]) => (
        <View key={name} className="flex-row items-center min-w-0">
          <View className={`w-2.5 h-2.5 rounded-full mr-2 ${status === "online" ? "bg-emerald-500" : status === "configured" ? "bg-amber-500" : "bg-red-500"}`} />
          <View>
            <Text className="text-foreground text-sm capitalize">{name}</Text>
            <Text className="text-muted-foreground text-xs">
              {status === "online" ? "Healthy" : status === "configured" ? "Warning" : "Offline"}
            </Text>
          </View>
        </View>
      ))}
      </ResponsiveGrid>
      <Text className="text-muted-foreground text-xs w-full mt-2">
        Last successful check: {new Date(health.lastCheckedAt).toLocaleString()}
      </Text>
    </View>
  );
}
