import React from "react";
import { Text, View } from "react-native";
import { Activity, CheckCircle2, MessageSquare, UserPlus, XCircle } from "lucide-react-native";
import type { DashboardActivity } from "@/types/adminDashboard";
import { DashboardEmpty } from "./DashboardStates";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

const icons = {
  user: UserPlus,
  application: Activity,
  approved: CheckCircle2,
  rejected: XCircle,
  review: MessageSquare,
};

export function RecentActivity({ items }: { items: DashboardActivity[] }) {
  const { isPhone } = useResponsiveLayout();
  if (!items.length) return <DashboardEmpty message="No recent platform activity." />;
  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden">
      {items.map((item, index) => {
        const Icon = icons[item.kind];
        return (
          <View key={item.id} className={`p-4 flex-row items-center ${index < items.length - 1 ? "border-b border-border" : ""}`}>
            <View className="w-10 h-10 bg-primary/10 rounded-xl items-center justify-center"><Icon size={19} className="text-primary" /></View>
            <View className="flex-1 min-w-0 ml-3">
              <Text className="text-foreground font-semibold text-sm" numberOfLines={1}>{item.action}</Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>Actor: {item.actor}</Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>Target: {item.target}</Text>
              {isPhone ? <Text className="text-muted-foreground text-xs mt-1">{new Date(item.createdAt).toLocaleDateString()}</Text> : null}
            </View>
            {!isPhone ? <Text className="text-muted-foreground text-xs">{new Date(item.createdAt).toLocaleDateString()}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
