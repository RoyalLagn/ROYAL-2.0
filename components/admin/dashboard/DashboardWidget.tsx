import React from "react";
import { Pressable, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { DashboardEmpty, DashboardError, DashboardSkeleton } from "./DashboardStates";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  onRefresh?: () => void;
  children: React.ReactNode;
};

export function DashboardWidget({
  title,
  subtitle,
  icon: Icon,
  loading,
  error,
  empty,
  emptyMessage = "No information is available.",
  onRefresh,
  children,
}: Props) {
  const { iconSize, titleSize, bodySize } = useResponsiveLayout();
  return (
    <ResponsiveCard className="overflow-hidden">
      <View className={`flex-row items-center ${bodySize <= 12 ? "mb-3" : "mb-4"}`}>
        {Icon ? <View className="min-w-11 min-h-11 rounded-xl bg-primary/10 items-center justify-center mr-3"><Icon size={iconSize} className="text-primary" /></View> : null}
        <View className="flex-1">
          <Text className="text-foreground font-bold" style={{ fontSize: titleSize }} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text className="text-muted-foreground mt-0.5" style={{ fontSize: bodySize }} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {onRefresh ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Refresh ${title}`} className="min-w-11 min-h-11 items-center justify-center" onPress={onRefresh}>
            <RefreshCw size={17} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      {loading ? <DashboardSkeleton />
        : error ? <DashboardError message={error} />
          : empty ? <DashboardEmpty message={emptyMessage} />
            : children}
    </ResponsiveCard>
  );
}
