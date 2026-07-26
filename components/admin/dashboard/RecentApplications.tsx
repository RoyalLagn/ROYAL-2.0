import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { RecentVendorApplication } from "@/types/adminDashboard";
import { DashboardEmpty } from "./DashboardStates";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

const relative = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};

export function RecentApplications({ items }: { items: RecentVendorApplication[] }) {
  const router = useRouter();
  const { isPhone } = useResponsiveLayout();
  if (!items.length) return <DashboardEmpty message="No vendor applications yet." />;
  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden">
      {items.map((item, index) => (
        <Pressable
          key={item.id}
          className={`min-h-11 p-4 ${index < items.length - 1 ? "border-b border-border" : ""}`}
          onPress={() => router.push({ pathname: "/VendorApplicationDetails", params: { id: item.id } })}
        >
          <View className={isPhone ? "gap-3" : "flex-row justify-between gap-3"}>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground font-semibold" numberOfLines={1}>{item.businessName}</Text>
              <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                {item.ownerName} · {item.category}
              </Text>
            </View>
            <View className={isPhone ? "flex-row items-center justify-between gap-2" : "items-end"}>
              <View className="flex-row items-center gap-2">
                <Text className={`text-xs font-semibold ${item.status === "pending" ? "text-red-500" : item.status === "rejected" ? "text-amber-500" : "text-emerald-500"}`}>
                  {item.status === "pending" ? "High" : "Normal"}
                </Text>
                <Text className="text-primary text-xs font-semibold capitalize">{item.status}</Text>
              </View>
              <Text className="text-muted-foreground text-xs">{relative(item.submittedAt)}</Text>
              <Text className="text-primary text-xs font-semibold">Quick View</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
