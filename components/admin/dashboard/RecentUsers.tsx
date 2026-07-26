import React from "react";
import { Image, Text, View } from "react-native";
import { UserRound } from "lucide-react-native";
import type { RecentPublicUser } from "@/types/adminDashboard";
import { DashboardEmpty } from "./DashboardStates";

export function RecentUsers({ items }: { items: RecentPublicUser[] }) {
  if (!items.length) return <DashboardEmpty message="No public users have registered yet." />;
  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden">
      {items.map((item, index) => (
        <View key={item.id} className={`p-4 flex-row items-center ${index < items.length - 1 ? "border-b border-border" : ""}`}>
          {item.profileImage
            ? <Image source={{ uri: item.profileImage }} className="w-11 h-11 rounded-full" />
            : <View className="w-11 h-11 rounded-full bg-muted items-center justify-center"><UserRound size={20} className="text-muted-foreground" /></View>}
          <View className="flex-1 ml-3">
            <Text className="text-foreground font-semibold" numberOfLines={1}>{item.fullName}</Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>{item.email}</Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          <Text className={`text-xs font-semibold ${item.isActive ? "text-emerald-500" : "text-red-500"}`}>
            {item.isActive ? "Active" : "Disabled"}
          </Text>
        </View>
      ))}
    </View>
  );
}
